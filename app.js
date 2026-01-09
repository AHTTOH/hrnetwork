// HR 인적 네트워크 뷰어 - 완전 오프라인 SPA
// 전역 상태 관리
var AppState = {
    nodes: [],
    edges: [],
    cy: null,
    selectedNodeId: null,
    searchMode: null, // 'company' | 'person' | null
    filters: {
        companies: new Set(),
        departments: new Set(),
        relations: new Set(),
        sensitiveRelations: true
    },
    settings: {
        hideLowWeightEdges: true,
        edgeLimit: 10000,
        labelLOD: 'auto',
        colorBlindMode: true,
        centralityBasedSize: true,
        departmentColors: true,
        autoScaleEdgeThickness: true,
        developerMode: false
    },
    visualSettings: {
        // 관계별 시각화 설정
        '배우자': {
            lineStyle: 'solid',
            lineWidth: 4,
            color: '#e74c3c',
            icon: '❤',
            showIcon: true,
            opacity: 80,
            blur: false,
            animation: false
        },
        '소속': {
            lineStyle: 'solid',
            lineWidth: 2,
            color: '#3498db',
            icon: '⭕',
            showIcon: true,
            opacity: 60,
            blur: false,
            animation: false
        },
        '친인척': {
            lineStyle: 'dotted',
            lineWidth: 2,
            color: '#e67e22',
            icon: '⭐',
            showIcon: true,
            opacity: 70,
            blur: true,
            animation: false
        },
        '동료': {
            lineStyle: 'solid',
            lineWidth: 1,
            color: '#95a5a6',
            icon: '',
            showIcon: false,
            opacity: 50,
            blur: false,
            animation: false
        },
        '상사': {
            lineStyle: 'solid',
            lineWidth: 2,
            color: '#2ecc71',
            icon: '',
            showIcon: false,
            opacity: 60,
            blur: false,
            animation: false
        },
        '부하': {
            lineStyle: 'solid',
            lineWidth: 2,
            color: '#2ecc71',
            icon: '',
            showIcon: false,
            opacity: 60,
            blur: false,
            animation: false
        },
        '프로젝트': {
            lineStyle: 'dashed',
            lineWidth: 1,
            color: '#9b59b6',
            icon: '',
            showIcon: false,
            opacity: 50,
            blur: false,
            animation: false
        }
    },
    globalVisualSettings: {
        nodeShadow: true,
        edgeCurveStyle: 'bezier',
        highlightGlow: true,
        unselectedBlur: 0,
        animationSpeed: 1.0,
        showEdgeLabel: true,
        hideCommonRelationLabels: false, // 일반 관계(동료, 프로젝트) 레이블 숨기기
        nodeLabelSize: 12,
        edgeLabelPosition: 'middle'
    },
    nodeMapping: null,
    edgeMapping: null,
    departmentColorMap: {},
    nodeCentrality: {}
};

// 필수 필드 정의
var NODES_REQUIRED_FIELDS = ['id', 'label', 'type'];
var NODES_OPTIONAL_FIELDS = ['company', 'department', 'title', 'birthdate', 'last_updated'];
var EDGES_REQUIRED_FIELDS = ['source', 'target', 'relation'];
var EDGES_OPTIONAL_FIELDS = ['since', 'note', 'evidence'];

// 관계 가중치
var RELATION_WEIGHTS = {
    '배우자': 3,
    '소속': 2,
    '친인척': 3,
    '동료': 1,
    '프로젝트': 1,
    '상사': 2,
    '부하': 2
};

// 민감 관계 타입
var SENSITIVE_RELATIONS = ['배우자', '친인척'];

// 관계별 아이콘 옵션
var RELATION_ICONS = {
    'none': '',
    'heart': '❤',
    'star': '⭐',
    'circle': '⭕',
    'cross': '❌',
    'triangle': '▲',
    'diamond': '◆'
};

// 선 스타일 옵션
var LINE_STYLES = ['solid', 'dotted', 'dashed', 'double'];

// 한글 초성 변환 함수
function getChosung(str) {
    if (!str) return '';
    var result = '';
    for (var i = 0; i < str.length; i++) {
        var charCode = str.charCodeAt(i);
        if (charCode >= 0xAC00 && charCode <= 0xD7A3) {
            // 한글 완성형
            var chosungIndex = Math.floor((charCode - 0xAC00) / 588);
            var chosungList = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
            result += chosungList[chosungIndex];
        } else {
            result += str[i];
        }
    }
    return result;
}

// 검색 함수 (한글 초성, 부분 일치, 대소문자 무시)
function matchesSearch(text, query) {
    if (!query) return false;
    var lowerText = text.toLowerCase();
    var lowerQuery = query.toLowerCase();
    
    // 부분 일치
    if (lowerText.indexOf(lowerQuery) !== -1) return true;
    
    // 초성 검색
    var textChosung = getChosung(text);
    var queryChosung = getChosung(query);
    if (textChosung.indexOf(queryChosung) !== -1) return true;
    
    return false;
}

// 파일 로딩 및 파싱
function loadFile(file, callback) {
    var fileName = file.name.toLowerCase();
    var reader = new FileReader();
    
    reader.onload = function(e) {
        var data = e.target.result;
        
        if (fileName.endsWith('.xlsx')) {
            parseXLSX(data, callback);
        } else if (fileName.endsWith('.csv')) {
            parseCSV(data, callback);
        } else {
            callback(null, new Error('지원하지 않는 파일 형식입니다.'));
        }
    };
    
    reader.onerror = function() {
        callback(null, new Error('파일 읽기 오류가 발생했습니다.'));
    };
    
    // 파일 형식에 따라 읽기 방식 선택
    if (fileName.endsWith('.xlsx')) {
        reader.readAsArrayBuffer(file);
    } else {
        reader.readAsText(file, 'UTF-8');
    }
}

function parseXLSX(data, callback) {
    try {
        var workbook = XLSX.read(data, { type: 'array' });
        
        // 시트 이름에 따라 자동 분류
        var nodesSheet = null;
        var edgesSheet = null;
        
        workbook.SheetNames.forEach(function(sheetName) {
            var lowerName = sheetName.toLowerCase();
            if (lowerName.indexOf('node') !== -1 || lowerName === '노드' || lowerName === 'nodes') {
                nodesSheet = workbook.Sheets[sheetName];
            } else if (lowerName.indexOf('edge') !== -1 || lowerName === '엣지' || lowerName === 'edges' || lowerName.indexOf('관계') !== -1) {
                edgesSheet = workbook.Sheets[sheetName];
            }
        });
        
        // 시트 이름으로 구분되지 않으면 첫 번째 시트 사용
        if (!nodesSheet && !edgesSheet) {
            var firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            var jsonData = XLSX.utils.sheet_to_json(firstSheet);
            
            // 컬럼 구조로 자동 판단
            if (jsonData.length > 0) {
                var headers = Object.keys(jsonData[0]);
                var hasNodeFields = headers.some(function(h) {
                    return ['id', 'label', 'type'].some(function(field) {
                        return h.toLowerCase().indexOf(field) !== -1 || h === '사번' || h === '이름' || h === '타입';
                    });
                });
                var hasEdgeFields = headers.some(function(h) {
                    return ['source', 'target', 'relation'].some(function(field) {
                        return h.toLowerCase().indexOf(field) !== -1 || h === '출발' || h === '도착' || h === '관계';
                    });
                });
                
                if (hasNodeFields && hasEdgeFields) {
                    // 노드와 엣지가 모두 있는 경우 분리
                    callback({ nodes: jsonData, edges: jsonData, unified: true }, null);
                    return;
                } else if (hasNodeFields) {
                    callback({ nodes: jsonData }, null);
                    return;
                } else if (hasEdgeFields) {
                    callback({ edges: jsonData }, null);
                    return;
                }
            }
            
            callback({ nodes: jsonData }, null);
        } else {
            var result = {};
            if (nodesSheet) {
                result.nodes = XLSX.utils.sheet_to_json(nodesSheet);
            }
            if (edgesSheet) {
                result.edges = XLSX.utils.sheet_to_json(edgesSheet);
            }
            callback(result, null);
        }
    } catch (error) {
        callback(null, error);
    }
}

function parseCSV(data, callback) {
    try {
        Papa.parse(data, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                if (!results || !results.data || results.data.length === 0) {
                    callback(null, new Error('데이터가 없습니다.'));
                    return;
                }
                
                // 컬럼 구조로 자동 판단
                if (!results.data[0] || typeof results.data[0] !== 'object') {
                    callback(null, new Error('데이터 형식이 올바르지 않습니다.'));
                    return;
                }
                
                var headers = Object.keys(results.data[0]);
                var hasNodeFields = headers.some(function(h) {
                    return ['id', 'label', 'type'].some(function(field) {
                        return h.toLowerCase().indexOf(field) !== -1 || h === '사번' || h === '이름' || h === '타입';
                    });
                });
                var hasEdgeFields = headers.some(function(h) {
                    return ['source', 'target', 'relation'].some(function(field) {
                        return h.toLowerCase().indexOf(field) !== -1 || h === '출발' || h === '도착' || h === '관계';
                    });
                });
                
                if (hasNodeFields && hasEdgeFields) {
                    // 노드와 엣지 필드가 모두 있으면 통합 데이터로 처리
                    callback({ nodes: results.data, edges: results.data, unified: true }, null);
                } else if (hasNodeFields) {
                    callback({ nodes: results.data }, null);
                } else if (hasEdgeFields) {
                    callback({ edges: results.data }, null);
                } else {
                    // 판단 불가능하면 노드로 처리
                    callback({ nodes: results.data }, null);
                }
            },
            error: function(error) {
                callback(null, error);
            }
        });
    } catch (error) {
        callback(null, error);
    }
}

// 매핑 위저드 표시
function showMappingWizard(data, type, callback) {
    var modal = document.getElementById('mapping-wizard-modal');
    var content = document.getElementById('mapping-wizard-content');
    content.innerHTML = '';
    
    if (!data || data.length === 0) {
        callback(null, new Error('데이터가 비어있습니다.'));
        return;
    }
    
    // 매핑 위저드 표시 시 로딩 숨기기 (사용자 입력 대기)
    showLoading(false);
    
    var headers = Object.keys(data[0]);
    var requiredFields = type === 'nodes' ? NODES_REQUIRED_FIELDS : EDGES_REQUIRED_FIELDS;
    var optionalFields = type === 'nodes' ? NODES_OPTIONAL_FIELDS : EDGES_OPTIONAL_FIELDS;
    
    // 필수 필드 매핑
    requiredFields.forEach(function(field) {
        var fieldDiv = document.createElement('div');
        fieldDiv.className = 'mapping-field';
        
        var label = document.createElement('label');
        label.innerHTML = field + ' <span class="required">(필수)</span>';
        fieldDiv.appendChild(label);
        
        var select = document.createElement('select');
        select.id = 'mapping-' + field;
        select.innerHTML = '<option value="">선택하세요</option>';
        headers.forEach(function(header) {
            var option = document.createElement('option');
            option.value = header;
            option.textContent = header;
            // 자동 매칭 시도
            if (header.toLowerCase() === field.toLowerCase() || 
                header.toLowerCase().indexOf(field.toLowerCase()) !== -1) {
                option.selected = true;
            }
            select.appendChild(option);
        });
        fieldDiv.appendChild(select);
        content.appendChild(fieldDiv);
    });
    
    // 선택 필드 매핑
    optionalFields.forEach(function(field) {
        var fieldDiv = document.createElement('div');
        fieldDiv.className = 'mapping-field';
        
        var label = document.createElement('label');
        label.innerHTML = field + ' <span class="optional">(선택)</span>';
        fieldDiv.appendChild(label);
        
        var select = document.createElement('select');
        select.id = 'mapping-' + field;
        select.innerHTML = '<option value="">없음</option>';
        headers.forEach(function(header) {
            var option = document.createElement('option');
            option.value = header;
            option.textContent = header;
            // 자동 매칭 시도
            if (header.toLowerCase() === field.toLowerCase() || 
                header.toLowerCase().indexOf(field.toLowerCase()) !== -1) {
                option.selected = true;
            }
            select.appendChild(option);
        });
        fieldDiv.appendChild(select);
        content.appendChild(fieldDiv);
    });
    
    modal.classList.remove('hidden');
    
    // 확인 버튼
    document.getElementById('mapping-confirm').onclick = function() {
        var mapping = {};
        var allFields = requiredFields.concat(optionalFields);
        
        allFields.forEach(function(field) {
            var select = document.getElementById('mapping-' + field);
            if (select && select.value) {
                mapping[field] = select.value;
            }
        });
        
        // 필수 필드 검증
        var missingFields = requiredFields.filter(function(field) {
            return !mapping[field];
        });
        
        if (missingFields.length > 0) {
            showError('다음 필수 필드가 매핑되지 않았습니다: ' + missingFields.join(', '));
            return;
        }
        
        modal.classList.add('hidden');
        // 매핑 확인 후 데이터 처리 시작 시 로딩 표시
        showLoading(true);
        callback(mapping, null);
    };
    
    // 취소 버튼
    document.getElementById('mapping-cancel').onclick = function() {
        modal.classList.add('hidden');
        showLoading(false);
        callback(null, new Error('사용자가 취소했습니다.'));
    };
}

// 관계 펼치기 (가로 열을 세로 다중행으로 변환)
function expandRelations(data, mapping) {
    if (!mapping || !mapping.relation || !data || data.length === 0) return data;
    
    var expandedData = [];
    var relationFields = [];
    
    // 관계 필드 찾기 (관계1, 관계2, 관계3 등)
    Object.keys(data[0] || {}).forEach(function(key) {
        if (key.toLowerCase().indexOf('관계') !== -1 || 
            key.toLowerCase().indexOf('relation') !== -1) {
            if (key !== mapping.relation) {
                relationFields.push(key);
            }
        }
    });
    
    data.forEach(function(row) {
        var baseRow = Object.assign({}, row);
        
        // 추가 관계 필드 제거
        relationFields.forEach(function(relField) {
            delete baseRow[relField];
        });
        
        // 기본 관계 행 추가
        if (row[mapping.relation]) {
            var firstRow = Object.assign({}, baseRow);
            firstRow[mapping.relation] = row[mapping.relation];
            expandedData.push(firstRow);
        }
        
        // 추가 관계 필드 처리
        relationFields.forEach(function(relField) {
            var relations = row[relField];
            if (!relations || String(relations).trim() === '') return;
            
            // 구분자 자동 인식
            var delimiter = ',';
            var relationStr = String(relations);
            if (relationStr.indexOf('/') !== -1) delimiter = '/';
            else if (relationStr.indexOf(';') !== -1) delimiter = ';';
            else if (relationStr.indexOf(',') !== -1) delimiter = ',';
            
            var relationList = relationStr.split(delimiter).map(function(r) {
                return r.trim();
            }).filter(function(r) {
                return r.length > 0;
            });
            
            relationList.forEach(function(rel) {
                var newRow = Object.assign({}, baseRow);
                newRow[mapping.relation] = rel;
                expandedData.push(newRow);
            });
        });
    });
    
    return expandedData.length > 0 ? expandedData : data;
}

// 데이터 매핑 및 변환
function mapData(data, mapping, type) {
    var mappedData = [];
    
    data.forEach(function(row, index) {
        var mappedRow = {};
        var allFields = type === 'nodes' ? 
            NODES_REQUIRED_FIELDS.concat(NODES_OPTIONAL_FIELDS) :
            EDGES_REQUIRED_FIELDS.concat(EDGES_OPTIONAL_FIELDS);
        
        allFields.forEach(function(field) {
            if (mapping[field]) {
                var value = row[mapping[field]];
                if (value !== undefined && value !== null && value !== '') {
                    mappedRow[field] = String(value).trim();
                }
            }
        });
        
        // 기본값 설정
        if (type === 'nodes') {
            if (!mappedRow.type) mappedRow.type = 'person';
        }
        
        mappedData.push(mappedRow);
    });
    
    return mappedData;
}

// 유효성 검증
function validateData(data, type) {
    var errors = [];
    var requiredFields = type === 'nodes' ? NODES_REQUIRED_FIELDS : EDGES_REQUIRED_FIELDS;
    
    data.forEach(function(row, index) {
        requiredFields.forEach(function(field) {
            if (!row[field] || String(row[field]).trim() === '') {
                errors.push({
                    row: index + 1,
                    field: field,
                    message: '필수 필드 "' + field + '"가 비어있습니다.'
                });
            }
        });
        
        if (type === 'nodes') {
            // ID 중복 체크는 나중에
        } else if (type === 'edges') {
            // 자기 자신 연결 체크
            if (row.source === row.target) {
                errors.push({
                    row: index + 1,
                    field: 'source/target',
                    message: '자기 자신과 연결할 수 없습니다. (source: ' + row.source + ', target: ' + row.target + ')'
                });
            }
        }
    });
    
    return errors;
}

// 노드 중심성 계산
function calculateCentrality() {
    if (AppState.nodes.length === 0) return;
    
    AppState.nodeCentrality = {};
    
    // 각 노드의 연결 수 계산
    AppState.nodes.forEach(function(node) {
        var nodeId = node.id;
        var degree = 0;
        
        AppState.edges.forEach(function(edge) {
            if (edge.source === nodeId || edge.target === nodeId) {
                degree++;
            }
        });
        
        AppState.nodeCentrality[nodeId] = degree;
    });
}

// 부서별 색상 맵 생성
function generateDepartmentColors() {
    if (AppState.nodes.length === 0) return;
    
    var departments = new Set();
    AppState.nodes.forEach(function(node) {
        if (node.department) {
            departments.add(node.department);
        }
    });
    
    var departmentArray = Array.from(departments).sort();
    AppState.departmentColorMap = {};
    
    var hueStep = 360 / Math.max(departmentArray.length, 1);
    
    departmentArray.forEach(function(dept, index) {
        var hue = (index * hueStep) % 360;
        var saturation = 70;
        var lightness = 50;
        
        // HSL to RGB 변환
        var h = hue / 360;
        var s = saturation / 100;
        var l = lightness / 100;
        
        var c = (1 - Math.abs(2 * l - 1)) * s;
        var x = c * (1 - Math.abs((h * 6) % 2 - 1));
        var m = l - c / 2;
        
        var r, g, b;
        if (h < 1/6) {
            r = c; g = x; b = 0;
        } else if (h < 2/6) {
            r = x; g = c; b = 0;
        } else if (h < 3/6) {
            r = 0; g = c; b = x;
        } else if (h < 4/6) {
            r = 0; g = x; b = c;
        } else if (h < 5/6) {
            r = x; g = 0; b = c;
        } else {
            r = c; g = 0; b = x;
        }
        
        r = Math.round((r + m) * 255);
        g = Math.round((g + m) * 255);
        b = Math.round((b + m) * 255);
        
        var color = '#' + [r, g, b].map(function(x) {
            var hex = x.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('');
        
        AppState.departmentColorMap[dept] = color;
    });
}

// 부서별 색상 가져오기
function getDepartmentColor(department) {
    if (!department || !AppState.departmentColorMap[department]) {
        return '#95a5a6'; // 회색
    }
    return AppState.departmentColorMap[department];
}

// Cytoscape 초기화
function initCytoscape() {
    if (AppState.cy) {
        AppState.cy.destroy();
    }
    
    // fcose 레이아웃 등록 확인 및 안전한 초기화
    var fcoseAvailable = false;
    try {
        if (typeof cytoscape !== 'undefined' && typeof cytoscapeFcose !== 'undefined') {
            // fcose가 제대로 로드되었는지 확인
            if (typeof cytoscapeFcose === 'function' || (typeof cytoscapeFcose === 'object' && cytoscapeFcose !== null)) {
                cytoscape.use(cytoscapeFcose);
                fcoseAvailable = true;
            }
        }
    } catch (e) {
        console.warn('cytoscape-fcose 초기화 실패:', e);
        fcoseAvailable = false;
    }
    
    // 중심성 및 부서별 색상 계산
    calculateCentrality();
    generateDepartmentColors();
    
    var elements = [];
    
    // 노드 추가
    AppState.nodes.forEach(function(node) {
        var nodeData = {
            data: {
                id: node.id,
                label: node.label,
                type: node.type,
                company: node.company || '',
                department: node.department || '',
                title: node.title || ''
            }
        };
        elements.push(nodeData);
    });
    
    // 엣지 추가
    AppState.edges.forEach(function(edge) {
        var edgeData = {
            data: {
                id: edge.source + '-' + edge.target + '-' + edge.relation,
                source: edge.source,
                target: edge.target,
                relation: edge.relation,
                weight: RELATION_WEIGHTS[edge.relation] || 1,
                since: edge.since || '',
                note: edge.note || ''
            }
        };
        elements.push(edgeData);
    });
    
    // 레이아웃 설정 (fcose가 없으면 grid 사용)
    var layoutOptions;
    if (fcoseAvailable) {
        try {
            // fcose 레이아웃이 실제로 사용 가능한지 테스트
            layoutOptions = {
                name: 'fcose',
                nodeRepulsion: 4500,
                idealEdgeLength: 100,
                edgeElasticity: 0.45,
                nestingFactor: 0.1,
                gravity: 0.25,
                numIter: 2500,
                tile: false,
                animate: true,
                animationDuration: 1000,
                animationEasing: undefined,
                fit: true,
                padding: 20,
                randomize: false,
                quality: 'default'
            };
        } catch (e) {
            console.warn('fcose 레이아웃 옵션 설정 실패, grid로 대체:', e);
            fcoseAvailable = false;
        }
    }
    
    // fcose가 없으면 grid 레이아웃 사용
    if (!fcoseAvailable) {
        layoutOptions = {
            name: 'grid',
            fit: true,
            padding: 20,
            animate: true,
            animationDuration: 1000
        };
    }
    
    AppState.cy = cytoscape({
        container: document.getElementById('cy'),
        elements: elements,
        style: getCytoscapeStyle(),
        layout: layoutOptions,
        wheelSensitivity: 0.3, // 줌 감도 조정 (기본값 1, 값이 작을수록 느림)
        minZoom: 0.1,
        maxZoom: 3
    });
    
    // 마우스 휠 줌 감도 추가 커스터마이징
    var cyContainer = document.getElementById('cy');
    var wheelHandler = function(e) {
        if (!AppState.cy) return;
        
        // 그래프 영역에서만 줌
        var target = e.target;
        if (target === cyContainer || cyContainer.contains(target) || (target.closest && target.closest('#cy'))) {
            e.preventDefault();
            e.stopPropagation();
            
            var currentZoom = AppState.cy.zoom();
            var zoomFactor = 0.05; // 줌 감도 (한 스크롤당 5%씩 변경 - 더 세밀한 조정)
            
            // 마우스 위치 가져오기
            var containerPos = cyContainer.getBoundingClientRect();
            var mousePos = {
                x: e.clientX - containerPos.left,
                y: e.clientY - containerPos.top
            };
            
            var newZoom;
            if (e.deltaY < 0) {
                // 줌인
                newZoom = Math.min(currentZoom * (1 + zoomFactor), 3);
            } else {
                // 줌아웃
                newZoom = Math.max(currentZoom * (1 - zoomFactor), 0.1);
            }
            
            // 줌 중심점을 마우스 위치로 설정
            try {
                var renderer = AppState.cy.renderer();
                var position = renderer.projectIntoViewport(mousePos.x, mousePos.y);
                AppState.cy.zoom({
                    level: newZoom,
                    renderedPosition: position
                });
            } catch (err) {
                // 렌더러 API가 다를 경우 간단한 줌만 사용
                AppState.cy.zoom(newZoom);
            }
        }
    };
    
    cyContainer.addEventListener('wheel', wheelHandler, { passive: false });
    
    // 이벤트 핸들러
    AppState.cy.on('tap', 'node', function(evt) {
        var node = evt.target;
        AppState.selectedNodeId = node.id();
        showNodeDetails(node);
        highlightNeighbors(node);
    });
    
    AppState.cy.on('tap', function(evt) {
        if (evt.target === AppState.cy) {
            AppState.selectedNodeId = null;
            clearSelection();
        }
    });
    
    // 줌 레벨 변경 시 LOD 업데이트
    AppState.cy.on('zoom', updateLOD);
    AppState.cy.on('pan', updateLOD);
    
    updateGraphInfo();
    applyFilters();
    
    // Empty State 숨김
    updateEmptyState();
}

// Empty State 표시/숨김 함수
function updateEmptyState() {
    var emptyState = document.getElementById('empty-state');
    if (!emptyState) return;
    
    if (AppState.nodes.length === 0 && !AppState.cy) {
        emptyState.style.display = 'flex';
    } else {
        emptyState.style.display = 'none';
    }
}

// 랜덤 흩뿌리기 기능
function randomizeLayout() {
    if (!AppState.cy || AppState.nodes.length === 0) return;
    
    // 현재 뷰포트 크기 가져오기
    var extent = AppState.cy.extent();
    var width = extent.x2 - extent.x1;
    var height = extent.y2 - extent.y1;
    
    // 뷰포트 중앙 기준으로 랜덤 위치 계산
    var centerX = (extent.x1 + extent.x2) / 2;
    var centerY = (extent.y1 + extent.y2) / 2;
    
    // 랜덤 배치 범위 (현재 뷰포트의 80% 범위)
    var rangeX = width * 0.8;
    var rangeY = height * 0.8;
    
    // 모든 노드를 랜덤 위치로 이동
    AppState.cy.nodes().forEach(function(node) {
        var randomX = centerX + (Math.random() - 0.5) * rangeX;
        var randomY = centerY + (Math.random() - 0.5) * rangeY;
        
        node.position({
            x: randomX,
            y: randomY
        });
    });
    
    // 레이아웃을 다시 fit
    AppState.cy.fit(undefined, { padding: 50 });
    
    // LOD 업데이트
    updateLOD();
}

// Cytoscape 스타일
function getCytoscapeStyle() {
    var colorBlindMode = AppState.settings.colorBlindMode;
    var centralityBasedSize = AppState.settings.centralityBasedSize;
    var departmentColors = AppState.settings.departmentColors;
    var globalSettings = AppState.globalVisualSettings;
    
    var styles = [];
    
    // 노드 스타일
    var nodeStyle = {
        selector: 'node',
        style: {
            'label': 'data(label)',
            'font-size': globalSettings.nodeLabelSize + 'px',
            'text-valign': 'center',
            'text-halign': 'center',
            'text-wrap': 'wrap',
            'text-max-width': '100px',
            'border-color': '#fff',
            'border-opacity': 1
        }
    };
    
    // 노드 크기 (중심성 기반)
    if (centralityBasedSize) {
        nodeStyle.style['width'] = function(ele) {
            var nodeId = ele.data('id');
            var centrality = AppState.nodeCentrality[nodeId] || 0;
            var maxCentrality = Math.max.apply(null, Object.values(AppState.nodeCentrality)) || 1;
            var size = 30 + (centrality / maxCentrality) * 50; // 30px ~ 80px
            return Math.max(30, Math.min(80, size)) + 'px';
        };
        nodeStyle.style['height'] = function(ele) {
            var nodeId = ele.data('id');
            var centrality = AppState.nodeCentrality[nodeId] || 0;
            var maxCentrality = Math.max.apply(null, Object.values(AppState.nodeCentrality)) || 1;
            var size = 30 + (centrality / maxCentrality) * 50; // 30px ~ 80px
            return Math.max(30, Math.min(80, size)) + 'px';
        };
        nodeStyle.style['border-width'] = function(ele) {
            var nodeId = ele.data('id');
            var centrality = AppState.nodeCentrality[nodeId] || 0;
            var maxCentrality = Math.max.apply(null, Object.values(AppState.nodeCentrality)) || 1;
            var width = 2 + (centrality / maxCentrality) * 3; // 2px ~ 5px
            return Math.max(2, Math.min(5, width)) + 'px';
        };
    } else {
        nodeStyle.style['width'] = '30px';
        nodeStyle.style['height'] = '30px';
        nodeStyle.style['border-width'] = 2;
    }
    
    // 노드 배경색 (부서별 색상 또는 타입별 색상)
    nodeStyle.style['background-color'] = function(ele) {
        var type = ele.data('type');
        var department = ele.data('department');
        
        if (departmentColors && department) {
            return getDepartmentColor(department);
        }
        
        // 타입별 기본 색상
        if (type === 'person') return colorBlindMode ? '#4a90e2' : '#3498db';
        if (type === 'company') return colorBlindMode ? '#e67e22' : '#e74c3c';
        if (type === 'external_person') return colorBlindMode ? '#27ae60' : '#2ecc71';
        if (type === 'external_company') return colorBlindMode ? '#9b59b6' : '#9b59b6';
        return '#95a5a6';
    };
    
    // 노드 그림자 효과
    if (globalSettings.nodeShadow) {
        nodeStyle.style['text-shadow-blur'] = 3;
        nodeStyle.style['text-shadow-offset-x'] = 1;
        nodeStyle.style['text-shadow-offset-y'] = 1;
        nodeStyle.style['text-shadow-color'] = '#000';
        nodeStyle.style['text-shadow-opacity'] = 0.5;
    }
    
    styles.push(nodeStyle);
    
    // 선택된 노드 스타일
    var selectedNodeStyle = {
        selector: 'node:selected',
        style: {
            'border-width': 4,
            'border-color': '#f39c12'
        }
    };
    
    if (globalSettings.highlightGlow) {
        selectedNodeStyle.style['border-opacity'] = 1;
        selectedNodeStyle.style['text-shadow-blur'] = 5;
        selectedNodeStyle.style['text-shadow-offset-x'] = 0;
        selectedNodeStyle.style['text-shadow-offset-y'] = 0;
        selectedNodeStyle.style['text-shadow-color'] = '#f39c12';
        selectedNodeStyle.style['text-shadow-opacity'] = 1;
    }
    
    if (centralityBasedSize) {
        selectedNodeStyle.style['width'] = function(ele) {
            var nodeId = ele.data('id');
            var centrality = AppState.nodeCentrality[nodeId] || 0;
            var maxCentrality = Math.max.apply(null, Object.values(AppState.nodeCentrality)) || 1;
            var size = 30 + (centrality / maxCentrality) * 50;
            return Math.max(40, Math.min(90, size + 10)) + 'px';
        };
        selectedNodeStyle.style['height'] = function(ele) {
            var nodeId = ele.data('id');
            var centrality = AppState.nodeCentrality[nodeId] || 0;
            var maxCentrality = Math.max.apply(null, Object.values(AppState.nodeCentrality)) || 1;
            var size = 30 + (centrality / maxCentrality) * 50;
            return Math.max(40, Math.min(90, size + 10)) + 'px';
        };
    } else {
        selectedNodeStyle.style['width'] = '40px';
        selectedNodeStyle.style['height'] = '40px';
    }
    
    styles.push(selectedNodeStyle);
    
    // 엣지 스타일
    var edgeStyle = {
        selector: 'edge',
        style: {
            'curve-style': globalSettings.edgeCurveStyle || 'bezier',
            'target-arrow-shape': 'triangle'
        }
    };
    
    edgeStyle.style['width'] = function(ele) {
        var relation = ele.data('relation');
        var setting = AppState.visualSettings[relation];
        var baseWidth = setting ? setting.lineWidth : 2;
        
        // 엣지 자동 크기 조정 기능
        if (AppState.settings.autoScaleEdgeThickness) {
            var weight = ele.data('weight') || RELATION_WEIGHTS[relation] || 1;
            // 가중치에 비례하여 두께 증가
            // 가중치가 높을수록 더 두껍게 (최대 3배까지)
            var scaleFactor = 1 + (weight * 0.3); // 가중치 1당 0.3배 증가
            baseWidth = Math.min(baseWidth * scaleFactor, baseWidth * 3);
        }
        
        return Math.round(baseWidth) + 'px';
    };
    
    edgeStyle.style['line-style'] = function(ele) {
        var relation = ele.data('relation');
        var setting = AppState.visualSettings[relation];
        if (setting) {
            return setting.lineStyle || 'solid';
        }
        return 'solid';
    };
    
    edgeStyle.style['line-color'] = function(ele) {
        var relation = ele.data('relation');
        var setting = AppState.visualSettings[relation];
        if (setting) {
            return setting.color || '#95a5a6';
        }
        return '#95a5a6';
    };
    
    edgeStyle.style['target-arrow-color'] = function(ele) {
        var relation = ele.data('relation');
        var setting = AppState.visualSettings[relation];
        if (setting) {
            return setting.color || '#95a5a6';
        }
        return '#95a5a6';
    };
    
    edgeStyle.style['opacity'] = function(ele) {
        var relation = ele.data('relation');
        var setting = AppState.visualSettings[relation];
        if (setting) {
            return setting.opacity / 100;
        }
        return 0.6;
    };
    
    // 엣지 레이블 (아이콘 또는 관계명)
    if (globalSettings.showEdgeLabel) {
        edgeStyle.style['label'] = function(ele) {
            var relation = ele.data('relation');
            var setting = AppState.visualSettings[relation];
            
            // 일반 관계 레이블 숨기기 옵션
            if (globalSettings.hideCommonRelationLabels) {
                // 동료, 프로젝트 같은 일반 관계 레이블 숨기기
                var commonRelations = ['동료', '프로젝트'];
                if (commonRelations.indexOf(relation) !== -1) {
                    // 아이콘만 표시하고 텍스트는 숨김
                    if (setting && setting.showIcon && setting.icon) {
                        return setting.icon;
                    }
                    return ''; // 레이블 숨김
                }
            }
            
            if (setting && setting.showIcon && setting.icon) {
                return setting.icon;
            }
            return relation;
        };
        edgeStyle.style['text-rotation'] = 'autorotate';
        edgeStyle.style['text-margin-y'] = -10;
        edgeStyle.style['font-size'] = '14px';
    }
    
    // 엣지 흐릿함 효과
    edgeStyle.style['line-cap'] = 'round';
    
    styles.push(edgeStyle);
    
    // 선택된 엣지 스타일
    styles.push({
        selector: 'edge:selected',
        style: {
            'opacity': 1,
            'width': function(ele) {
                var relation = ele.data('relation');
                var setting = AppState.visualSettings[relation];
                if (setting) {
                    return Math.max(setting.lineWidth + 2, 4) + 'px';
                }
                return '4px';
            }
        }
    });
    
    return styles;
}

// LOD (Level of Detail) 업데이트
function updateLOD() {
    if (!AppState.cy) return;
    
    var zoom = AppState.cy.zoom();
    var zoomThreshold = 0.5;
    
    AppState.cy.nodes().forEach(function(node) {
        if (zoom < zoomThreshold) {
            node.style('label', '');
        } else {
            node.style('label', 'data(label)');
        }
    });
}

// 그래프 정보 업데이트
function updateGraphInfo() {
    if (!AppState.cy) return;
    
    var nodeCount = AppState.cy.nodes().length;
    var edgeCount = AppState.cy.edges().length;
    
    document.getElementById('node-count').textContent = '노드: ' + nodeCount;
    document.getElementById('edge-count').textContent = '엣지: ' + edgeCount;
}

// 필터 적용
function applyFilters() {
    if (!AppState.cy) return;
    
    AppState.cy.elements().removeClass('filtered');
    
    // 노드 필터
    AppState.cy.nodes().forEach(function(node) {
        var shouldShow = true;
        var nodeData = node.data();
        
        // 회사 필터
        if (AppState.filters.companies.size > 0) {
            if (!AppState.filters.companies.has(nodeData.company)) {
                shouldShow = false;
            }
        }
        
        // 부서 필터
        if (AppState.filters.departments.size > 0) {
            if (!AppState.filters.departments.has(nodeData.department)) {
                shouldShow = false;
            }
        }
        
        if (!shouldShow) {
            node.addClass('filtered');
        }
    });
    
    // 엣지 필터
    AppState.cy.edges().forEach(function(edge) {
        var shouldShow = true;
        var edgeData = edge.data();
        
        // 관계 필터
        if (AppState.filters.relations.size > 0) {
            if (!AppState.filters.relations.has(edgeData.relation)) {
                shouldShow = false;
            }
        }
        
        // 민감 관계 필터
        if (!AppState.filters.sensitiveRelations) {
            if (SENSITIVE_RELATIONS.indexOf(edgeData.relation) !== -1) {
                shouldShow = false;
            }
        }
        
        // 성능 필터
        if (AppState.settings.hideLowWeightEdges) {
            if (edgeData.weight < 2) {
                shouldShow = false;
            }
        }
        
        // 엣지 수 제한
        var visibleEdges = AppState.cy.edges().not('.filtered').length;
        if (visibleEdges > AppState.settings.edgeLimit) {
            // 가중치가 낮은 엣지부터 숨김
            var sortedEdges = AppState.cy.edges().not('.filtered').sort(function(a, b) {
                return (b.data('weight') || 0) - (a.data('weight') || 0);
            });
            sortedEdges.slice(AppState.settings.edgeLimit).forEach(function(e) {
                e.addClass('filtered');
            });
        }
        
        if (!shouldShow) {
            edge.addClass('filtered');
        }
    });
    
    // 필터된 요소 숨김
    AppState.cy.elements('.filtered').style('opacity', 0.1);
    AppState.cy.elements().not('.filtered').style('opacity', 1);
    
    updateGraphInfo();
}

// 이웃 노드 하이라이트
function highlightNeighbors(node) {
    if (!AppState.cy) return;
    
    var neighbors = node.neighborhood();
    
    AppState.cy.elements().removeClass('highlight');
    AppState.cy.elements().style('opacity', 0.3);
    
    node.addClass('highlight');
    node.style('opacity', 1);
    neighbors.addClass('highlight');
    neighbors.style('opacity', 1);
}

// 선택 해제
function clearSelection() {
    if (!AppState.cy) return;
    
    AppState.cy.elements().removeClass('highlight');
    AppState.cy.elements().style('opacity', 1);
    
    document.getElementById('node-details-panel').classList.add('hidden');
    document.getElementById('search-results-panel').classList.add('hidden');
}

// 노드 상세 정보 표시
function showNodeDetails(node) {
    var panel = document.getElementById('node-details-panel');
    var content = document.getElementById('node-details-content');
    var nodeData = node.data();
    
    content.innerHTML = '';
    
    var fields = ['id', 'label', 'type', 'company', 'department', 'title'];
    fields.forEach(function(field) {
        if (nodeData[field]) {
            var item = document.createElement('div');
            item.className = 'node-detail-item';
            item.innerHTML = '<span class="node-detail-label">' + field + ':</span>' + nodeData[field];
            content.appendChild(item);
        }
    });
    
    panel.classList.remove('hidden');
    document.getElementById('search-results-panel').classList.add('hidden');
}

// 검색 기능
function performSearch(query) {
    if (!query || query.trim() === '') {
        clearSearch();
        return;
    }
    
    query = query.trim();
    
    // 회사 검색
    var companyMatches = AppState.nodes.filter(function(node) {
        return node.type === 'company' && matchesSearch(node.label, query);
    });
    
    // 사람 검색
    var personMatches = AppState.nodes.filter(function(node) {
        return (node.type === 'person' || node.type === 'external_person') && matchesSearch(node.label, query);
    });
    
    if (companyMatches.length > 0 && personMatches.length === 0) {
        // 회사 모드
        AppState.searchMode = 'company';
        showCompanyMode(companyMatches[0], query);
    } else if (personMatches.length > 0 && companyMatches.length === 0) {
        // 사람 모드
        AppState.searchMode = 'person';
        showPersonMode(personMatches[0], query);
    } else if (companyMatches.length > 0 || personMatches.length > 0) {
        // 후보 리스트
        showSearchCandidates(companyMatches, personMatches, query);
    } else {
        // 검색 결과 없음
        showNoResults(query);
    }
}

// 회사 모드
function showCompanyMode(company, query) {
    if (!AppState.cy) return;
    
    var companyId = company.id;
    var companyNode = AppState.cy.getElementById(companyId);
    
    if (companyNode.length === 0) return;
    
    // 회사 중심 1~2단계 이웃 표시
    var neighbors = companyNode.neighborhood();
    var secondNeighbors = neighbors.neighborhood();
    
    AppState.cy.elements().removeClass('search-result');
    AppState.cy.elements().style('opacity', 0.1);
    
    companyNode.addClass('search-result');
    companyNode.style('opacity', 1);
    neighbors.addClass('search-result');
    neighbors.style('opacity', 1);
    secondNeighbors.addClass('search-result');
    secondNeighbors.style('opacity', 0.7);
    
    // 회사 중심으로 포커스
    AppState.cy.fit(companyNode.union(neighbors).union(secondNeighbors), {
        padding: 100
    });
    
    // 사이드패널 정보 표시
    var panel = document.getElementById('search-results-panel');
    var title = document.getElementById('search-results-title');
    var content = document.getElementById('search-results-content');
    
    title.textContent = '회사 모드: ' + company.label;
    content.innerHTML = '';
    
    // 내부 직원 수 (회사와 직접 연결된 직원)
    var internalEmployees = neighbors.filter(function(node) {
        var nodeType = node.data('type');
        if (nodeType !== 'person' && nodeType !== 'external_person') return false;
        
        // 회사와 직접 연결된 엣지 확인
        var connectingEdge = AppState.cy.edges().filter(function(edge) {
            return ((edge.source().id() === node.id() && edge.target().id() === companyId) ||
                    (edge.source().id() === companyId && edge.target().id() === node.id())) &&
                   edge.data('relation') === '소속';
        });
        
        return connectingEdge.length > 0;
    });
    
    var employeeCount = document.createElement('div');
    employeeCount.className = 'node-detail-item';
    employeeCount.innerHTML = '<strong>내부 직원 수:</strong> ' + internalEmployees.length;
    content.appendChild(employeeCount);
    
    // 배우자를 통해 연결된 직원 목록
    var spouseConnections = [];
    internalEmployees.forEach(function(emp) {
        var empEdges = AppState.cy.edges().filter(function(edge) {
            return (edge.source().id() === emp.id() || edge.target().id() === emp.id()) &&
                   edge.data('relation') === '배우자';
        });
        if (empEdges.length > 0) {
            spouseConnections.push(emp.data('label'));
        }
    });
    
    if (spouseConnections.length > 0) {
        var spouseDiv = document.createElement('div');
        spouseDiv.className = 'node-detail-item';
        spouseDiv.innerHTML = '<strong>배우자를 통해 연결된 직원:</strong> ' + spouseConnections.join(', ');
        content.appendChild(spouseDiv);
    }
    
    // 부서/직급 분포
    var departmentCount = {};
    var titleCount = {};
    internalEmployees.forEach(function(emp) {
        var dept = emp.data('department') || '미지정';
        var title = emp.data('title') || '미지정';
        departmentCount[dept] = (departmentCount[dept] || 0) + 1;
        titleCount[title] = (titleCount[title] || 0) + 1;
    });
    
    var deptDiv = document.createElement('div');
    deptDiv.className = 'node-detail-item';
    deptDiv.innerHTML = '<strong>부서 분포:</strong> ' + Object.keys(departmentCount).map(function(d) {
        return d + ' (' + departmentCount[d] + ')';
    }).join(', ');
    content.appendChild(deptDiv);
    
    panel.classList.remove('hidden');
    document.getElementById('node-details-panel').classList.add('hidden');
}

// 사람 모드
function showPersonMode(person, query) {
    if (!AppState.cy) return;
    
    var personId = person.id;
    var personNode = AppState.cy.getElementById(personId);
    
    if (personNode.length === 0) return;
    
    // 사람 중심 네트워크 표시
    var neighbors = personNode.neighborhood();
    
    AppState.cy.elements().removeClass('search-result');
    AppState.cy.elements().style('opacity', 0.1);
    
    personNode.addClass('search-result');
    personNode.style('opacity', 1);
    neighbors.addClass('search-result');
    neighbors.style('opacity', 1);
    
    // 사람 중심으로 포커스
    AppState.cy.fit(personNode.union(neighbors), {
        padding: 100
    });
    
    // 사이드패널 정보 표시
    var panel = document.getElementById('search-results-panel');
    var title = document.getElementById('search-results-title');
    var content = document.getElementById('search-results-content');
    
    title.textContent = '사람 모드: ' + person.label;
    content.innerHTML = '';
    
    // 소속 회사/부서/직함
    if (person.company) {
        var companyDiv = document.createElement('div');
        companyDiv.className = 'node-detail-item';
        companyDiv.innerHTML = '<strong>소속 회사:</strong> ' + person.company;
        content.appendChild(companyDiv);
    }
    
    if (person.department) {
        var deptDiv = document.createElement('div');
        deptDiv.className = 'node-detail-item';
        deptDiv.innerHTML = '<strong>부서:</strong> ' + person.department;
        content.appendChild(deptDiv);
    }
    
    if (person.title) {
        var titleDiv = document.createElement('div');
        titleDiv.className = 'node-detail-item';
        titleDiv.innerHTML = '<strong>직함:</strong> ' + person.title;
        content.appendChild(titleDiv);
    }
    
    // 배우자/친인척의 소속 회사 하이라이트
    var spouseCompanies = new Set();
    neighbors.forEach(function(neighbor) {
        var edge = AppState.cy.edges().filter(function(e) {
            return (e.source().id() === personId && e.target().id() === neighbor.id()) ||
                   (e.source().id() === neighbor.id() && e.target().id() === personId);
        });
        if (edge.length > 0 && (edge[0].data('relation') === '배우자' || edge[0].data('relation') === '친인척')) {
            var neighborData = neighbor.data();
            if (neighborData.company) {
                spouseCompanies.add(neighborData.company);
            }
        }
    });
    
    if (spouseCompanies.size > 0) {
        var spouseDiv = document.createElement('div');
        spouseDiv.className = 'node-detail-item';
        spouseDiv.innerHTML = '<strong>배우자/친인척 소속 회사:</strong> ' + Array.from(spouseCompanies).join(', ');
        content.appendChild(spouseDiv);
    }
    
    // 경로 탐색 버튼
    var buttonDiv = document.createElement('div');
    buttonDiv.style.marginTop = '10px';
    buttonDiv.style.display = 'flex';
    buttonDiv.style.gap = '10px';
    buttonDiv.style.flexWrap = 'wrap';
    
    var pathButton = document.createElement('button');
    pathButton.className = 'btn-primary';
    pathButton.textContent = '특정 회사까지 최단 경로';
    pathButton.onclick = function() {
        showPathFinder(personId);
    };
    buttonDiv.appendChild(pathButton);
    
    var spouseButton = document.createElement('button');
    spouseButton.className = 'btn-secondary';
    spouseButton.textContent = '배우자를 통해 연결된 회사 보기';
    spouseButton.onclick = function() {
        showSpouseCompanies(personId);
    };
    buttonDiv.appendChild(spouseButton);
    
    content.appendChild(buttonDiv);
    
    panel.classList.remove('hidden');
    document.getElementById('node-details-panel').classList.add('hidden');
}

// 검색 후보 리스트
function showSearchCandidates(companyMatches, personMatches, query) {
    var panel = document.getElementById('search-results-panel');
    var title = document.getElementById('search-results-title');
    var content = document.getElementById('search-results-content');
    
    title.textContent = '검색 결과: ' + query;
    content.innerHTML = '';
    
    if (companyMatches.length > 0) {
        var companyHeader = document.createElement('h4');
        companyHeader.textContent = '회사 (' + companyMatches.length + ')';
        content.appendChild(companyHeader);
        
        companyMatches.forEach(function(company) {
            var item = document.createElement('div');
            item.className = 'node-detail-item';
            item.style.cursor = 'pointer';
            item.textContent = company.label;
            item.onclick = function() {
                showCompanyMode(company, query);
            };
            content.appendChild(item);
        });
    }
    
    if (personMatches.length > 0) {
        var personHeader = document.createElement('h4');
        personHeader.textContent = '사람 (' + personMatches.length + ')';
        content.appendChild(personHeader);
        
        personMatches.forEach(function(person) {
            var item = document.createElement('div');
            item.className = 'node-detail-item';
            item.style.cursor = 'pointer';
            item.textContent = person.label + (person.department ? ' (' + person.department + ')' : '');
            item.onclick = function() {
                showPersonMode(person, query);
            };
            content.appendChild(item);
        });
    }
    
    panel.classList.remove('hidden');
}

// 검색 결과 없음
function showNoResults(query) {
    var panel = document.getElementById('search-results-panel');
    var title = document.getElementById('search-results-title');
    var content = document.getElementById('search-results-content');
    
    title.textContent = '검색 결과 없음';
    content.innerHTML = '<p>"' + query + '"에 대한 검색 결과가 없습니다.</p>';
    
    panel.classList.remove('hidden');
}

// 검색 초기화
function clearSearch() {
    AppState.searchMode = null;
    AppState.selectedNodeId = null;
    clearSelection();
}

// 경로 탐색 (최단 경로)
function findShortestPath(sourceId, targetId) {
    if (!AppState.cy) return null;
    
    var source = AppState.cy.getElementById(sourceId);
    var target = AppState.cy.getElementById(targetId);
    
    if (source.length === 0 || target.length === 0) return null;
    
    // BFS 기반 최단 경로 탐색
    var queue = [{ node: sourceId, path: [sourceId], score: 0 }];
    var visited = new Set([sourceId]);
    var foundPath = null;
    
    while (queue.length > 0 && !foundPath) {
        var current = queue.shift();
        
        var currentNode = AppState.cy.getElementById(current.node);
        var neighbors = currentNode.neighborhood('node');
        
        for (var i = 0; i < neighbors.length && !foundPath; i++) {
            var neighbor = neighbors[i];
            var neighborId = neighbor.id();
            
            if (neighborId === targetId) {
                // 경로 찾음
                var finalPath = current.path.concat([targetId]);
                foundPath = {
                    path: finalPath,
                    score: current.score,
                    edges: getPathEdges(finalPath)
                };
                break;
            }
            
            if (!visited.has(neighborId)) {
                visited.add(neighborId);
                
                // 엣지 가중치 계산
                var edge = AppState.cy.edges().filter(function(e) {
                    return (e.source().id() === current.node && e.target().id() === neighborId) ||
                           (e.source().id() === neighborId && e.target().id() === current.node);
                });
                
                var edgeWeight = 1;
                if (edge.length > 0) {
                    edgeWeight = RELATION_WEIGHTS[edge[0].data('relation')] || 1;
                }
                
                queue.push({
                    node: neighborId,
                    path: current.path.concat([neighborId]),
                    score: current.score + (1 / edgeWeight)
                });
            }
        }
    }
    
    return foundPath;
}

// 경로의 엣지 가져오기
function getPathEdges(path) {
    var edges = [];
    for (var i = 0; i < path.length - 1; i++) {
        var edge = AppState.cy.edges().filter(function(e) {
            return (e.source().id() === path[i] && e.target().id() === path[i + 1]) ||
                   (e.source().id() === path[i + 1] && e.target().id() === path[i]);
        });
        if (edge.length > 0) {
            edges.push(edge[0]);
        }
    }
    return edges;
}

// 경로 찾기 UI
function showPathFinder(sourceId) {
    var targetQuery = prompt('목표 회사명을 입력하세요:');
    if (!targetQuery) return;
    
    var targetCompany = AppState.nodes.find(function(node) {
        return node.type === 'company' && matchesSearch(node.label, targetQuery);
    });
    
    if (!targetCompany) {
        alert('해당 회사를 찾을 수 없습니다.');
        return;
    }
    
    var path = findShortestPath(sourceId, targetCompany.id);
    
    if (!path) {
        alert('경로를 찾을 수 없습니다.');
        return;
    }
    
    // 경로 하이라이트
    AppState.cy.elements().removeClass('path-highlight');
    AppState.cy.elements().style('opacity', 0.1);
    
    path.path.forEach(function(nodeId) {
        var node = AppState.cy.getElementById(nodeId);
        node.addClass('path-highlight');
        node.style('opacity', 1);
    });
    
    path.edges.forEach(function(edge) {
        edge.addClass('path-highlight');
        edge.style('opacity', 1);
        edge.style('width', 4);
    });
    
    AppState.cy.fit(AppState.cy.elements('.path-highlight'), {
        padding: 100
    });
    
    alert('경로를 찾았습니다. 경로 길이: ' + (path.path.length - 1) + '단계');
}

// 배우자를 통해 연결된 회사 보기
function showSpouseCompanies(personId) {
    if (!AppState.cy) return;
    
    var personNode = AppState.cy.getElementById(personId);
    if (personNode.length === 0) return;
    
    var spouseCompanies = new Set();
    var spouseNodes = [];
    
    personNode.neighborhood().forEach(function(neighbor) {
        var edge = AppState.cy.edges().filter(function(e) {
            return (e.source().id() === personId && e.target().id() === neighbor.id()) ||
                   (e.source().id() === neighbor.id() && e.target().id() === personId);
        });
        
        if (edge.length > 0 && edge[0].data('relation') === '배우자') {
            spouseNodes.push(neighbor);
            var neighborData = neighbor.data();
            if (neighborData.company) {
                spouseCompanies.add(neighborData.company);
            }
            
            // 배우자의 이웃 회사도 찾기
            neighbor.neighborhood().forEach(function(company) {
                if (company.data('type') === 'company') {
                    spouseCompanies.add(company.data('label'));
                }
            });
        }
    });
    
    if (spouseCompanies.size === 0) {
        alert('배우자를 통해 연결된 회사를 찾을 수 없습니다.');
        return;
    }
    
    // 하이라이트
    AppState.cy.elements().removeClass('spouse-highlight');
    AppState.cy.elements().style('opacity', 0.1);
    
    personNode.addClass('spouse-highlight');
    personNode.style('opacity', 1);
    
    spouseNodes.forEach(function(node) {
        node.addClass('spouse-highlight');
        node.style('opacity', 1);
        
        node.neighborhood().forEach(function(company) {
            if (company.data('type') === 'company') {
                company.addClass('spouse-highlight');
                company.style('opacity', 1);
            }
        });
    });
    
    AppState.cy.fit(AppState.cy.elements('.spouse-highlight'), {
        padding: 100
    });
    
    alert('배우자를 통해 연결된 회사: ' + Array.from(spouseCompanies).join(', '));
}

// 필터 UI 업데이트
function updateFilterUI() {
    // 회사 필터
    updateMultiSelectFilter('company', 'company-filters', 'company-filter-options', 'company-filter-search', function() {
        var companies = new Set();
        AppState.nodes.forEach(function(node) {
            if (node.company) companies.add(node.company);
        });
        return Array.from(companies).sort();
    }, AppState.filters.companies);
    
    // 부서 필터
    updateMultiSelectFilter('department', 'department-filters', 'department-filter-options', 'department-filter-search', function() {
        var departments = new Set();
        AppState.nodes.forEach(function(node) {
            if (node.department) departments.add(node.department);
        });
        return Array.from(departments).sort();
    }, AppState.filters.departments);
    
    // 관계 필터
    updateMultiSelectFilter('relation', 'relation-filters', 'relation-filter-options', 'relation-filter-search', function() {
        var relations = new Set();
        AppState.edges.forEach(function(edge) {
            if (edge.relation) relations.add(edge.relation);
        });
        return Array.from(relations).sort();
    }, AppState.filters.relations);
}

// Multi-select 필터 업데이트 헬퍼 함수
var multiSelectInitialized = {};

function updateMultiSelectFilter(filterType, selectId, optionsId, searchId, getItemsFn, filterSet) {
    var select = document.getElementById(selectId);
    var optionsContainer = document.getElementById(optionsId);
    var searchInput = document.getElementById(searchId);
    
    if (!select || !optionsContainer || !searchInput) return;
    
    var dropdown = optionsContainer.closest('.multi-select-dropdown');
    var header = dropdown.querySelector('.multi-select-header');
    
    // 옵션 초기화
    select.innerHTML = '';
    optionsContainer.innerHTML = '';
    
    var allItems = getItemsFn();
    var searchTerm = '';
    
    // 검색 기능
    function updateOptions() {
        optionsContainer.innerHTML = '';
        select.innerHTML = '';
        
        var currentSearchTerm = searchInput.value || '';
        var filteredItems = allItems.filter(function(item) {
            return item.toLowerCase().includes(currentSearchTerm.toLowerCase());
        });
        
        filteredItems.forEach(function(item) {
            var option = document.createElement('div');
            option.className = 'multi-select-option';
            if (filterSet.has(item)) {
                option.classList.add('selected');
            }
            
            var checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = item;
            checkbox.checked = filterSet.has(item);
            checkbox.onchange = function() {
                if (checkbox.checked) {
                    filterSet.add(item);
                    option.classList.add('selected');
                } else {
                    filterSet.delete(item);
                    option.classList.remove('selected');
                }
                applyFilters();
                // 옵션 다시 업데이트
                updateOptions();
            };
            
            var label = document.createElement('span');
            label.textContent = item;
            
            option.appendChild(checkbox);
            option.appendChild(label);
            optionsContainer.appendChild(option);
            
            // select에도 옵션 추가 (접근성)
            var selectOption = document.createElement('option');
            selectOption.value = item;
            selectOption.selected = filterSet.has(item);
            select.appendChild(selectOption);
        });
    }
    
    // 이벤트 리스너는 한 번만 등록
    if (!multiSelectInitialized[filterType]) {
        // 검색 입력 이벤트
        searchInput.addEventListener('input', function(e) {
            e.stopPropagation();
            updateOptions();
        });
        
        // 검색 입력 클릭 시 드롭다운 열기
        searchInput.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!dropdown.classList.contains('active')) {
                dropdown.classList.add('active');
                header.classList.add('active');
            }
        });
        
        // 드롭다운 토글
        header.addEventListener('click', function(e) {
            if (e.target !== searchInput && e.target !== header.querySelector('.multi-select-toggle')) {
                dropdown.classList.toggle('active');
                header.classList.toggle('active');
            }
        });
        
        // 외부 클릭 시 닫기
        document.addEventListener('click', function(e) {
            if (!dropdown.contains(e.target)) {
                dropdown.classList.remove('active');
                header.classList.remove('active');
            }
        });
        
        multiSelectInitialized[filterType] = true;
    }
    
    // 초기 옵션 생성
    updateOptions();
}

// 오류 표시
function showError(message) {
    var modal = document.getElementById('error-modal');
    var content = document.getElementById('error-content');
    
    if (Array.isArray(message)) {
        content.innerHTML = '';
        message.forEach(function(error) {
            var item = document.createElement('div');
            item.className = 'error-item';
            item.textContent = '행 ' + error.row + ': ' + error.message;
            content.appendChild(item);
        });
    } else {
        content.innerHTML = '<p>' + message + '</p>';
    }
    
    modal.classList.remove('hidden');
    
    document.getElementById('error-close').onclick = function() {
        modal.classList.add('hidden');
    };
}

// 로딩 표시
function showLoading(show) {
    var overlay = document.getElementById('loading-overlay');
    if (show) {
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
}

// 내보내기 기능
function exportPNG() {
    if (!AppState.cy) {
        alert('그래프가 없습니다.');
        return;
    }
    
    var png = AppState.cy.png({ 
        output: 'blob',
        bg: 'white',
        full: true
    });
    
    var url = URL.createObjectURL(png);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'hr-network-' + new Date().getTime() + '.png';
    link.click();
    URL.revokeObjectURL(url);
}

function exportSVG() {
    if (!AppState.cy) {
        alert('그래프가 없습니다.');
        return;
    }
    
    var svg = AppState.cy.svg({ 
        output: 'blob',
        bg: 'white',
        full: true
    });
    
    var url = URL.createObjectURL(svg);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'hr-network-' + new Date().getTime() + '.svg';
    link.click();
    URL.revokeObjectURL(url);
}

function exportCSVNodes() {
    if (!AppState.cy) {
        alert('그래프가 없습니다.');
        return;
    }
    
    var selectedNodes = AppState.cy.nodes(':selected');
    if (selectedNodes.length === 0) {
        selectedNodes = AppState.cy.nodes();
    }
    
    var csv = 'id,label,type,company,department,title\n';
    selectedNodes.forEach(function(node) {
        var data = node.data();
        csv += [
            data.id || '',
            data.label || '',
            data.type || '',
            data.company || '',
            data.department || '',
            data.title || ''
        ].map(function(field) {
            return '"' + String(field).replace(/"/g, '""') + '"';
        }).join(',') + '\n';
    });
    
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'nodes-' + new Date().getTime() + '.csv';
    link.click();
    URL.revokeObjectURL(url);
}

function exportCSVEdges() {
    if (!AppState.cy) {
        alert('그래프가 없습니다.');
        return;
    }
    
    var selectedEdges = AppState.cy.edges(':selected');
    if (selectedEdges.length === 0) {
        selectedEdges = AppState.cy.edges();
    }
    
    var csv = 'source,target,relation,since,note\n';
    selectedEdges.forEach(function(edge) {
        var data = edge.data();
        csv += [
            data.source || '',
            data.target || '',
            data.relation || '',
            data.since || '',
            data.note || ''
        ].map(function(field) {
            return '"' + String(field).replace(/"/g, '""') + '"';
        }).join(',') + '\n';
    });
    
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'edges-' + new Date().getTime() + '.csv';
    link.click();
    URL.revokeObjectURL(url);
}

// LocalStorage 저장/복원
function saveSettings() {
    var settings = {
        filters: {
            companies: Array.from(AppState.filters.companies),
            departments: Array.from(AppState.filters.departments),
            relations: Array.from(AppState.filters.relations),
            sensitiveRelations: AppState.filters.sensitiveRelations
        },
        settings: AppState.settings,
        visualSettings: AppState.visualSettings,
        globalVisualSettings: AppState.globalVisualSettings
    };
    
    try {
        localStorage.setItem('hrNetworkSettings', JSON.stringify(settings));
        alert('설정이 저장되었습니다.');
    } catch (error) {
        alert('설정 저장 중 오류가 발생했습니다: ' + error.message);
    }
}

function loadSettings(showAlert) {
    // showAlert가 undefined이면 false로 처리 (초기 로드 시)
    showAlert = showAlert || false;
    
    try {
        var saved = localStorage.getItem('hrNetworkSettings');
        if (!saved) {
            if (showAlert) {
                alert('저장된 설정이 없습니다.');
            }
            return;
        }
        
        var settings = JSON.parse(saved);
        
        AppState.filters.companies = new Set(settings.filters.companies || []);
        AppState.filters.departments = new Set(settings.filters.departments || []);
        AppState.filters.relations = new Set(settings.filters.relations || []);
        AppState.filters.sensitiveRelations = settings.filters.sensitiveRelations || false;
        
        AppState.settings = Object.assign({}, AppState.settings, settings.settings || {});
        
        // 시각화 설정 불러오기
        if (settings.visualSettings) {
            AppState.visualSettings = settings.visualSettings;
        }
        if (settings.globalVisualSettings) {
            AppState.globalVisualSettings = Object.assign({}, AppState.globalVisualSettings, settings.globalVisualSettings);
        }
        
        // UI 업데이트
        updateFilterUI();
        updateRelationVisualSettingsUI();
        updateGlobalVisualSettingsUI();
        document.getElementById('sensitive-relations-toggle').checked = AppState.filters.sensitiveRelations;
        document.getElementById('hide-low-weight-edges').checked = AppState.settings.hideLowWeightEdges;
        document.getElementById('edge-limit-slider').value = AppState.settings.edgeLimit;
        document.getElementById('edge-limit-value').textContent = AppState.settings.edgeLimit;
        document.getElementById('color-blind-toggle').checked = AppState.settings.colorBlindMode;
        if (document.getElementById('centrality-based-size-toggle')) {
            document.getElementById('centrality-based-size-toggle').checked = AppState.settings.centralityBasedSize || false;
        }
        if (document.getElementById('department-colors-toggle')) {
            document.getElementById('department-colors-toggle').checked = AppState.settings.departmentColors || false;
        }
        
        updateGraphStyle();
        applyFilters();
        
        if (showAlert) {
            alert('설정이 불러와졌습니다.');
        }
    } catch (error) {
        if (showAlert) {
            alert('설정 불러오기 중 오류가 발생했습니다: ' + error.message);
        }
    }
}

function resetSettings() {
    if (!confirm('모든 설정을 초기화하시겠습니까?')) return;
    
    // 검색어 초기화
    document.getElementById('search-input').value = '';
    clearSearch();
    
    // 필터 초기화
    AppState.filters = {
        companies: new Set(),
        departments: new Set(),
        relations: new Set(),
        sensitiveRelations: false
    };
    
    // 설정 초기화
    AppState.settings = {
        hideLowWeightEdges: false,
        edgeLimit: 10000,
        labelLOD: 'auto',
        colorBlindMode: false,
        centralityBasedSize: false,
        departmentColors: false,
        autoScaleEdgeThickness: false,
        developerMode: false
    };
    
    // 관계별 시각화 설정 초기화
    applyPreset('default');
    
    AppState.globalVisualSettings = {
        nodeShadow: false,
        edgeCurveStyle: 'bezier',
        highlightGlow: false,
        unselectedBlur: 0,
        animationSpeed: 1.0,
        showEdgeLabel: false,
        hideCommonRelationLabels: false,
        nodeLabelSize: 12,
        edgeLabelPosition: 'middle'
    };
    
    try {
        localStorage.removeItem('hrNetworkSettings');
        localStorage.removeItem('hrNetworkCustomPreset');
    } catch (error) {
        // 무시
    }
    
    updateFilterUI();
    updateRelationVisualSettingsUI();
    updateGlobalVisualSettingsUI();
    document.getElementById('sensitive-relations-toggle').checked = false;
    document.getElementById('hide-low-weight-edges').checked = false;
    document.getElementById('edge-limit-slider').value = 10000;
    document.getElementById('edge-limit-value').textContent = '10000';
    document.getElementById('color-blind-toggle').checked = false;
    document.getElementById('centrality-based-size-toggle').checked = false;
    document.getElementById('department-colors-toggle').checked = false;
    
    // 개발자 모드 초기화
    var developerModeToggle = document.getElementById('developer-mode-toggle');
    if (developerModeToggle) {
        developerModeToggle.checked = false;
        document.getElementById('individual-files-section').style.display = 'none';
    }
    
    updateGraphStyle();
    applyFilters();
    alert('설정이 초기화되었습니다.');
}

// 샘플 데이터 (CSP 준수를 위해 JavaScript에 임베드)
var SAMPLE_NODES_CSV = 'id,label,type,company,department,title,birthdate,last_updated\nN001,홍길동,person,A사,개발팀,팀장,1980-01-15,2024-01-01\nN002,김철수,person,A사,개발팀,과장,1985-03-20,2024-01-02\nN003,이영희,person,A사,마케팅팀,부장,1978-07-10,2024-01-03\nN004,박민수,person,B사,영업팀,대리,1990-05-25,2024-01-04\nN005,정수진,person,B사,개발팀,차장,1982-09-12,2024-01-05\nN006,최동욱,person,A사,개발팀,과장,1987-11-30,2024-01-06\nN007,강미영,person,A사,인사팀,팀장,1975-04-18,2024-01-07\nN008,윤태호,person,B사,영업팀,부장,1973-12-05,2024-01-08\nN009,임지은,person,C사,디자인팀,과장,1988-08-22,2024-01-09\nN010,한지훈,person,A사,개발팀,대리,1992-02-14,2024-01-10\nN011,A사,company,,,,\nN012,B사,company,,,,\nN013,C사,company,,,,\nN014,홍길동의 배우자,external_person,,,,\nN015,김철수의 부모,external_person,,,,\nN016,송민수,person,A사,기획팀,과장,1986-09-03,2024-01-11\nN017,장혜진,person,A사,재무팀,팀장,1979-11-20,2024-01-12\nN018,오준호,person,B사,개발팀,과장,1984-07-15,2024-01-13\nN019,윤서연,person,B사,마케팅팀,대리,1991-03-28,2024-01-14\nN020,조현우,person,C사,기획팀,차장,1983-05-10,2024-01-15\nN021,김나영,person,A사,개발팀,대리,1993-08-22,2024-01-16\nN022,이동욱,person,A사,영업팀,과장,1981-12-05,2024-01-17\nN023,박서준,person,B사,인사팀,팀장,1976-06-18,2024-01-18\nN024,최지영,person,C사,마케팅팀,부장,1977-09-30,2024-01-19\nN025,강도현,person,D사,개발팀,팀장,1980-02-14,2024-01-20\nN026,정민지,person,D사,디자인팀,과장,1989-04-25,2024-01-21\nN027,한승우,person,A사,기획팀,대리,1994-06-12,2024-01-22\nN028,임다은,person,B사,재무팀,차장,1985-10-08,2024-01-23\nN029,송지훈,person,C사,영업팀,팀장,1974-01-20,2024-01-24\nN030,김수정,person,D사,마케팅팀,과장,1987-07-05,2024-01-25\nN031,이태호,person,A사,개발팀,선임,1995-11-15,2024-01-26\nN032,박소연,person,B사,개발팀,대리,1992-04-03,2024-01-27\nN033,최민규,person,A사,마케팅팀,과장,1983-08-22,2024-01-28\nN034,강하늘,person,C사,개발팀,차장,1981-03-10,2024-01-29\nN035,D사,company,,,,\nN036,이영희의 배우자,external_person,,,,\nN037,박민수의 부모,external_person,,,,\nN038,정수진의 배우자,external_person,,,,\nN039,윤태호의 배우자,external_person,,,,\nN040,임지은의 부모,external_person,,,,\nN041,송민수의 배우자,external_person,,,,\nN042,장혜진의 배우자,external_person,,,,\nN043,오준호의 부모,external_person,,,,\nN044,조현우의 배우자,external_person,,,,\nN045,김나영의 부모,external_person,,,,';
var SAMPLE_EDGES_CSV = 'source,target,relation,since,note,evidence\nN001,N011,소속,2020-01-01,정규직 입사,\nN002,N011,소속,2021-03-15,정규직 입사,\nN003,N011,소속,2019-05-20,정규직 입사,\nN004,N012,소속,2022-07-10,정규직 입사,\nN005,N012,소속,2018-09-01,정규직 입사,\nN006,N011,소속,2021-11-20,정규직 입사,\nN007,N011,소속,2017-02-14,정규직 입사,\nN008,N012,소속,2016-04-30,정규직 입사,\nN009,N013,소속,2023-01-05,정규직 입사,\nN010,N011,소속,2023-06-15,정규직 입사,\nN016,N011,소속,2020-03-10,정규직 입사,\nN017,N011,소속,2018-05-15,정규직 입사,\nN018,N012,소속,2019-07-20,정규직 입사,\nN019,N012,소속,2021-09-25,정규직 입사,\nN020,N013,소속,2017-11-30,정규직 입사,\nN021,N011,소속,2023-02-14,정규직 입사,\nN022,N011,소속,2019-04-18,정규직 입사,\nN023,N012,소속,2016-08-22,정규직 입사,\nN024,N013,소속,2018-10-12,정규직 입사,\nN025,N035,소속,2020-06-01,정규직 입사,\nN026,N035,소속,2021-08-15,정규직 입사,\nN027,N011,소속,2023-03-20,정규직 입사,\nN028,N012,소속,2017-12-05,정규직 입사,\nN029,N013,소속,2015-01-10,정규직 입사,\nN030,N035,소속,2019-05-25,정규직 입사,\nN031,N011,소속,2023-07-10,정규직 입사,\nN032,N012,소속,2022-09-15,정규직 입사,\nN033,N011,소속,2018-03-20,정규직 입사,\nN034,N013,소속,2016-11-08,정규직 입사,\nN001,N002,동료,2021-03-15,같은 팀,\nN001,N006,동료,2021-11-20,같은 팀,\nN001,N010,상사,2023-06-15,부하직원,\nN001,N021,상사,2023-02-14,부하직원,\nN001,N031,상사,2023-07-10,부하직원,\nN002,N006,동료,2021-11-20,같은 팀,\nN002,N010,동료,2023-06-15,같은 팀,\nN002,N021,동료,2023-02-14,같은 팀,\nN002,N031,동료,2023-07-10,같은 팀,\nN006,N010,동료,2023-06-15,같은 팀,\nN006,N021,동료,2023-02-14,같은 팀,\nN006,N031,동료,2023-07-10,같은 팀,\nN010,N021,동료,2023-02-14,같은 팀,\nN010,N031,동료,2023-07-10,같은 팀,\nN021,N031,동료,2023-07-10,같은 팀,\nN003,N033,동료,2018-03-20,같은 팀,\nN003,N007,동료,2017-02-14,같은 회사,\nN003,N016,동료,2020-03-10,같은 회사,\nN003,N017,동료,2018-05-15,같은 회사,\nN003,N022,동료,2019-04-18,같은 회사,\nN003,N027,동료,2023-03-20,같은 회사,\nN007,N016,동료,2020-03-10,같은 회사,\nN007,N017,동료,2018-05-15,같은 회사,\nN007,N022,동료,2019-04-18,같은 회사,\nN016,N017,동료,2018-05-15,같은 회사,\nN016,N022,동료,2019-04-18,같은 회사,\nN017,N022,동료,2019-04-18,같은 회사,\nN004,N008,상사,2022-07-10,부하직원,\nN004,N019,동료,2021-09-25,같은 팀,\nN004,N032,동료,2022-09-15,같은 회사,\nN008,N019,상사,2021-09-25,부하직원,\nN008,N028,동료,2017-12-05,같은 회사,\nN008,N032,상사,2022-09-15,부하직원,\nN019,N032,동료,2022-09-15,같은 회사,\nN005,N008,동료,2018-09-01,같은 회사,\nN005,N018,동료,2019-07-20,같은 팀,\nN005,N023,동료,2016-08-22,같은 회사,\nN005,N028,동료,2017-12-05,같은 회사,\nN018,N023,동료,2016-08-22,같은 회사,\nN018,N028,동료,2017-12-05,같은 회사,\nN023,N028,동료,2017-12-05,같은 회사,\nN009,N020,동료,2017-11-30,같은 회사,\nN009,N024,동료,2018-10-12,같은 회사,\nN009,N029,동료,2015-01-10,같은 회사,\nN009,N034,동료,2016-11-08,같은 회사,\nN020,N024,동료,2018-10-12,같은 회사,\nN020,N029,동료,2015-01-10,같은 회사,\nN020,N034,동료,2016-11-08,같은 회사,\nN024,N029,동료,2015-01-10,같은 회사,\nN024,N034,동료,2016-11-08,같은 회사,\nN029,N034,동료,2016-11-08,같은 회사,\nN025,N026,동료,2021-08-15,같은 회사,\nN025,N030,동료,2019-05-25,같은 회사,\nN026,N030,동료,2019-05-25,같은 회사,\nN001,N003,프로젝트,2023-01-01,공동 프로젝트 참여,\nN001,N007,프로젝트,2022-06-01,공동 프로젝트 참여,\nN001,N016,프로젝트,2023-05-15,공동 프로젝트 참여,\nN001,N017,프로젝트,2022-08-20,공동 프로젝트 참여,\nN003,N007,프로젝트,2022-06-01,공동 프로젝트 참여,\nN003,N016,프로젝트,2023-05-15,공동 프로젝트 참여,\nN003,N017,프로젝트,2022-08-20,공동 프로젝트 참여,\nN007,N016,프로젝트,2023-05-15,공동 프로젝트 참여,\nN007,N017,프로젝트,2022-08-20,공동 프로젝트 참여,\nN016,N017,프로젝트,2022-08-20,공동 프로젝트 참여,\nN004,N005,프로젝트,2023-03-10,크로스 회사 프로젝트,\nN008,N025,프로젝트,2022-11-15,크로스 회사 프로젝트,\nN009,N020,프로젝트,2021-09-20,크로스 회사 프로젝트,\nN001,N014,배우자,2005-06-20,결혼,\nN003,N036,배우자,2003-05-15,결혼,\nN005,N038,배우자,2010-08-22,결혼,\nN008,N039,배우자,2008-12-10,결혼,\nN016,N041,배우자,2012-04-18,결혼,\nN017,N042,배우자,2006-09-25,결혼,\nN020,N044,배우자,2015-07-03,결혼,\nN002,N015,친인척,1985-03-20,부모,\nN004,N037,친인척,1990-05-25,부모,\nN009,N040,친인척,1988-08-22,부모,\nN018,N043,친인척,1984-07-15,부모,\nN021,N045,친인척,1993-08-22,부모,\nN001,N004,프로젝트,2022-12-01,크로스 회사 협업,\nN001,N025,프로젝트,2023-04-10,크로스 회사 협업,\nN003,N009,프로젝트,2022-07-20,크로스 회사 협업,\nN007,N023,프로젝트,2021-05-15,크로스 회사 협업,';

// 샘플 데이터 로드
function loadSampleData(type, callback) {
    callback = callback || function() {};
    var csvData = type === 'nodes' ? SAMPLE_NODES_CSV : SAMPLE_EDGES_CSV;
    
    parseCSV(csvData, function(data, error) {
        if (error) {
            showError('샘플 데이터 파싱 오류: ' + error.message);
            showLoading(false);
            callback(error);
            return;
        }
        
        // parseCSV가 객체 형태로 반환할 수 있으므로 처리
        var actualData = null;
        if (type === 'nodes') {
            actualData = data.nodes || data;
        } else {
            actualData = data.edges || data;
        }
        
        if (!actualData || !Array.isArray(actualData) || actualData.length === 0) {
            showError('샘플 데이터가 올바르지 않습니다.');
            showLoading(false);
            callback(new Error('샘플 데이터가 올바르지 않습니다.'));
            return;
        }
        
        if (type === 'nodes') {
            processNodesData(actualData, function(err) {
                if (err) {
                    showLoading(false);
                }
                callback(err);
            });
        } else {
            processEdgesData(actualData, function(err) {
                if (err) {
                    showLoading(false);
                }
                callback(err);
            });
        }
    });
}

// 노드 데이터 처리
function processNodesData(data, callback) {
    callback = callback || function() {};
    var showAlert = !callback || callback.toString().indexOf('function() {}') === -1;
    
    showMappingWizard(data, 'nodes', function(mapping, error) {
        if (error) {
            if (error.message !== '사용자가 취소했습니다.') {
                showError('매핑 오류: ' + error.message);
            }
            callback(error);
            return;
        }
        
        AppState.nodeMapping = mapping;
        var expandedData = expandRelations(data, mapping);
        var mappedData = mapData(expandedData, mapping, 'nodes');
        var errors = validateData(mappedData, 'nodes');
        
        if (errors.length > 0) {
            showError(errors);
            callback(new Error('데이터 검증 오류'));
            return;
        }
        
        AppState.nodes = mappedData;
        showLoading(false);
        
        if (AppState.edges.length > 0) {
            initCytoscape();
        }
        
        updateFilterUI();
        updateEmptyState();
        
        if (showAlert) {
            alert('Nodes 데이터가 로드되었습니다. (' + mappedData.length + '개)');
        }
        
        callback(null);
    });
}

// 엣지 데이터 처리
function processEdgesData(data, callback) {
    callback = callback || function() {};
    
    showMappingWizard(data, 'edges', function(mapping, error) {
        if (error) {
            if (error.message !== '사용자가 취소했습니다.') {
                showError('매핑 오류: ' + error.message);
            }
            callback(error);
            return;
        }
        
        AppState.edgeMapping = mapping;
        var expandedData = expandRelations(data, mapping);
        var mappedData = mapData(expandedData, mapping, 'edges');
        var errors = validateData(mappedData, 'edges');
        
        if (errors.length > 0) {
            showError(errors);
            callback(new Error('데이터 검증 오류'));
            return;
        }
        
        // source/target ID 검증
        var validNodes = new Set(AppState.nodes.map(function(n) { return n.id; }));
        var invalidEdges = [];
        
        mappedData.forEach(function(edge, index) {
            if (!validNodes.has(edge.source) || !validNodes.has(edge.target)) {
                invalidEdges.push({
                    row: index + 1,
                    field: 'source/target',
                    message: '노드를 찾을 수 없습니다. (source: ' + edge.source + ', target: ' + edge.target + ')'
                });
            }
        });
        
        if (invalidEdges.length > 0) {
            showError(invalidEdges);
            callback(new Error('노드 ID 검증 오류'));
            return;
        }
        
        AppState.edges = mappedData;
        showLoading(false);
        
        updateFilterUI();
        updateEmptyState();
        
        // 통합 파일이 아닌 경우에만 알림 표시
        var showAlert = !callback || callback.toString().indexOf('function() {}') === -1;
        if (showAlert) {
            alert('Edges 데이터가 로드되었습니다. (' + mappedData.length + '개)');
        }
        
        callback(null);
    });
}

// 관계별 시각화 설정 UI 생성
function updateRelationVisualSettingsUI() {
    var container = document.getElementById('relation-visual-settings');
    container.innerHTML = '';
    
    Object.keys(AppState.visualSettings).forEach(function(relation) {
        var setting = AppState.visualSettings[relation];
        
        // 아코디언 컨테이너
        var accordionWrapper = document.createElement('div');
        accordionWrapper.className = 'relation-accordion';
        accordionWrapper.style.marginBottom = '12px';
        
        // 아코디언 헤더 (클릭 가능)
        var accordionHeader = document.createElement('div');
        accordionHeader.className = 'accordion-header';
        accordionHeader.style.display = 'flex';
        accordionHeader.style.alignItems = 'center';
        accordionHeader.style.justifyContent = 'space-between';
        
        var headerLeft = document.createElement('div');
        headerLeft.style.display = 'flex';
        headerLeft.style.alignItems = 'center';
        headerLeft.style.gap = '12px';
        
        var relationName = document.createElement('span');
        relationName.textContent = relation;
        relationName.style.fontWeight = '600';
        relationName.style.fontSize = '14px';
        
        // 요약 정보 (색상, 선 두께)
        var summaryInfo = document.createElement('span');
        summaryInfo.style.fontSize = '12px';
        summaryInfo.style.color = 'var(--color-text-secondary)';
        summaryInfo.innerHTML = '<span style="display:inline-block;width:12px;height:12px;background-color:' + setting.color + ';border-radius:2px;margin-right:4px;vertical-align:middle;"></span>' + setting.lineWidth + 'px';
        
        headerLeft.appendChild(relationName);
        headerLeft.appendChild(summaryInfo);
        
        var expandIcon = document.createElement('span');
        expandIcon.textContent = '▼';
        expandIcon.style.fontSize = '10px';
        expandIcon.style.transition = 'transform 0.3s ease';
        expandIcon.id = 'relation-' + relation + '-icon';
        
        accordionHeader.appendChild(headerLeft);
        accordionHeader.appendChild(expandIcon);
        
        // 아코디언 컨텐츠
        var accordionContent = document.createElement('div');
        accordionContent.className = 'accordion-content';
        accordionContent.id = 'relation-' + relation + '-content';
        
        var relationDiv = document.createElement('div');
        relationDiv.className = 'relation-setting-group';
        relationDiv.style.marginBottom = '0';
        relationDiv.style.padding = '10px';
        relationDiv.style.border = 'none';
        relationDiv.style.borderRadius = '0';
        relationDiv.style.backgroundColor = 'transparent';
        
        // 클릭 이벤트로 접기/펼치기
        accordionHeader.addEventListener('click', function() {
            var isExpanded = accordionContent.classList.contains('expanded');
            if (isExpanded) {
                accordionContent.classList.remove('expanded');
                expandIcon.style.transform = 'rotate(0deg)';
            } else {
                accordionContent.classList.add('expanded');
                expandIcon.style.transform = 'rotate(180deg)';
            }
        });
        
        // 선 스타일
        var lineStyleLabel = document.createElement('label');
        lineStyleLabel.textContent = '선 스타일: ';
        lineStyleLabel.style.display = 'block';
        lineStyleLabel.style.marginBottom = '5px';
        lineStyleLabel.style.fontSize = '12px';
        var lineStyleSelect = document.createElement('select');
        lineStyleSelect.id = 'relation-' + relation + '-linestyle';
        LINE_STYLES.forEach(function(style) {
            var option = document.createElement('option');
            option.value = style;
            option.textContent = style === 'solid' ? '실선' : style === 'dotted' ? '점선' : style === 'dashed' ? '대시선' : '이중선';
            if (style === setting.lineStyle) option.selected = true;
            lineStyleSelect.appendChild(option);
        });
        lineStyleSelect.addEventListener('change', function() {
            AppState.visualSettings[relation].lineStyle = lineStyleSelect.value;
            updateGraphStyle();
        });
        lineStyleLabel.appendChild(lineStyleSelect);
        relationDiv.appendChild(lineStyleLabel);
        
        // 선 두께
        var lineWidthLabel = document.createElement('label');
        lineWidthLabel.textContent = '선 두께: ';
        lineWidthLabel.style.display = 'block';
        lineWidthLabel.style.marginBottom = '5px';
        lineWidthLabel.style.fontSize = '12px';
        var lineWidthSlider = document.createElement('input');
        lineWidthSlider.type = 'range';
        lineWidthSlider.id = 'relation-' + relation + '-linewidth';
        lineWidthSlider.min = '1';
        lineWidthSlider.max = '8';
        lineWidthSlider.value = setting.lineWidth;
        var lineWidthValue = document.createElement('span');
        lineWidthValue.id = 'relation-' + relation + '-linewidth-value';
        lineWidthValue.textContent = setting.lineWidth + 'px';
        lineWidthSlider.addEventListener('input', function() {
            AppState.visualSettings[relation].lineWidth = parseInt(lineWidthSlider.value);
            lineWidthValue.textContent = lineWidthSlider.value + 'px';
            updateGraphStyle();
        });
        lineWidthLabel.appendChild(lineWidthSlider);
        lineWidthLabel.appendChild(lineWidthValue);
        relationDiv.appendChild(lineWidthLabel);
        
        // 색상
        var colorLabel = document.createElement('label');
        colorLabel.textContent = '색상: ';
        colorLabel.style.display = 'block';
        colorLabel.style.marginBottom = '5px';
        colorLabel.style.fontSize = '12px';
        var colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.id = 'relation-' + relation + '-color';
        colorInput.value = setting.color;
        colorInput.addEventListener('change', function() {
            AppState.visualSettings[relation].color = colorInput.value;
            updateGraphStyle();
        });
        colorLabel.appendChild(colorInput);
        relationDiv.appendChild(colorLabel);
        
        // 아이콘 표시
        var iconLabel = document.createElement('label');
        iconLabel.style.display = 'block';
        iconLabel.style.marginBottom = '5px';
        iconLabel.style.fontSize = '12px';
        var iconCheckbox = document.createElement('input');
        iconCheckbox.type = 'checkbox';
        iconCheckbox.id = 'relation-' + relation + '-showicon';
        iconCheckbox.checked = setting.showIcon;
        iconCheckbox.addEventListener('change', function() {
            AppState.visualSettings[relation].showIcon = iconCheckbox.checked;
            updateGraphStyle();
        });
        iconLabel.appendChild(iconCheckbox);
        iconLabel.appendChild(document.createTextNode(' 아이콘 표시'));
        var iconSelect = document.createElement('select');
        iconSelect.id = 'relation-' + relation + '-icon';
        iconSelect.style.marginLeft = '10px';
        Object.keys(RELATION_ICONS).forEach(function(iconKey) {
            var option = document.createElement('option');
            option.value = iconKey;
            option.textContent = iconKey === 'none' ? '없음' : iconKey === 'heart' ? '❤ 하트' : iconKey === 'star' ? '⭐ 별' : iconKey === 'circle' ? '⭕ 동그라미' : iconKey === 'cross' ? '❌ 엑스' : iconKey === 'triangle' ? '▲ 삼각형' : '◆ 다이아몬드';
            if (setting.icon === RELATION_ICONS[iconKey]) option.selected = true;
            iconSelect.appendChild(option);
        });
        iconSelect.addEventListener('change', function() {
            AppState.visualSettings[relation].icon = RELATION_ICONS[iconSelect.value];
            updateGraphStyle();
        });
        iconLabel.appendChild(iconSelect);
        relationDiv.appendChild(iconLabel);
        
        // 투명도
        var opacityLabel = document.createElement('label');
        opacityLabel.textContent = '투명도: ';
        opacityLabel.style.display = 'block';
        opacityLabel.style.marginBottom = '5px';
        opacityLabel.style.fontSize = '12px';
        var opacitySlider = document.createElement('input');
        opacitySlider.type = 'range';
        opacitySlider.id = 'relation-' + relation + '-opacity';
        opacitySlider.min = '0';
        opacitySlider.max = '100';
        opacitySlider.value = setting.opacity;
        var opacityValue = document.createElement('span');
        opacityValue.id = 'relation-' + relation + '-opacity-value';
        opacityValue.textContent = setting.opacity + '%';
        opacitySlider.addEventListener('input', function() {
            AppState.visualSettings[relation].opacity = parseInt(opacitySlider.value);
            opacityValue.textContent = opacitySlider.value + '%';
            updateGraphStyle();
        });
        opacityLabel.appendChild(opacitySlider);
        opacityLabel.appendChild(opacityValue);
        relationDiv.appendChild(opacityLabel);
        
        // 흐릿함 효과
        var blurLabel = document.createElement('label');
        blurLabel.style.display = 'block';
        blurLabel.style.marginBottom = '5px';
        blurLabel.style.fontSize = '12px';
        var blurCheckbox = document.createElement('input');
        blurCheckbox.type = 'checkbox';
        blurCheckbox.id = 'relation-' + relation + '-blur';
        blurCheckbox.checked = setting.blur;
        blurCheckbox.addEventListener('change', function() {
            AppState.visualSettings[relation].blur = blurCheckbox.checked;
            updateGraphStyle();
        });
        blurLabel.appendChild(blurCheckbox);
        blurLabel.appendChild(document.createTextNode(' 흐릿함 효과'));
        relationDiv.appendChild(blurLabel);
        
        // 애니메이션
        var animationLabel = document.createElement('label');
        animationLabel.style.display = 'block';
        animationLabel.style.fontSize = '12px';
        var animationCheckbox = document.createElement('input');
        animationCheckbox.type = 'checkbox';
        animationCheckbox.id = 'relation-' + relation + '-animation';
        animationCheckbox.checked = setting.animation;
        animationCheckbox.addEventListener('change', function() {
            AppState.visualSettings[relation].animation = animationCheckbox.checked;
            updateGraphStyle();
        });
        animationLabel.appendChild(animationCheckbox);
        animationLabel.appendChild(document.createTextNode(' 애니메이션'));
        relationDiv.appendChild(animationLabel);
        
        accordionContent.appendChild(relationDiv);
        accordionWrapper.appendChild(accordionHeader);
        accordionWrapper.appendChild(accordionContent);
        container.appendChild(accordionWrapper);
    });
}

// 그래프 스타일 업데이트
function updateGraphStyle() {
    if (!AppState.cy) return;
    AppState.cy.style(getCytoscapeStyle());
}

// 프리셋 적용
function applyPreset(presetName) {
    if (presetName === 'default') {
        // 기본값 설정 복원
        AppState.visualSettings = {
            '배우자': { lineStyle: 'solid', lineWidth: 4, color: '#e74c3c', icon: '❤', showIcon: true, opacity: 80, blur: false, animation: false },
            '소속': { lineStyle: 'solid', lineWidth: 2, color: '#3498db', icon: '⭕', showIcon: true, opacity: 60, blur: false, animation: false },
            '친인척': { lineStyle: 'dotted', lineWidth: 2, color: '#e67e22', icon: '⭐', showIcon: true, opacity: 70, blur: true, animation: false },
            '동료': { lineStyle: 'solid', lineWidth: 1, color: '#95a5a6', icon: '', showIcon: false, opacity: 50, blur: false, animation: false },
            '상사': { lineStyle: 'solid', lineWidth: 2, color: '#2ecc71', icon: '', showIcon: false, opacity: 60, blur: false, animation: false },
            '부하': { lineStyle: 'solid', lineWidth: 2, color: '#2ecc71', icon: '', showIcon: false, opacity: 60, blur: false, animation: false },
            '프로젝트': { lineStyle: 'dashed', lineWidth: 1, color: '#9b59b6', icon: '', showIcon: false, opacity: 50, blur: false, animation: false }
        };
        AppState.globalVisualSettings = {
            nodeShadow: false,
            edgeCurveStyle: 'bezier',
            highlightGlow: false,
            unselectedBlur: 0,
            animationSpeed: 1.0,
            showEdgeLabel: false,
            nodeLabelSize: 12,
            edgeLabelPosition: 'middle'
        };
    } else if (presetName === 'highlight') {
        // 강조 모드
        Object.keys(AppState.visualSettings).forEach(function(relation) {
            AppState.visualSettings[relation].lineWidth = Math.max(4, AppState.visualSettings[relation].lineWidth);
            AppState.visualSettings[relation].opacity = Math.min(100, AppState.visualSettings[relation].opacity + 20);
        });
        AppState.globalVisualSettings.highlightGlow = true;
        AppState.globalVisualSettings.showEdgeLabel = true;
    } else if (presetName === 'minimal') {
        // 미니멀 모드
        Object.keys(AppState.visualSettings).forEach(function(relation) {
            AppState.visualSettings[relation].lineWidth = 1;
            AppState.visualSettings[relation].opacity = 30;
            AppState.visualSettings[relation].showIcon = false;
        });
        AppState.globalVisualSettings.nodeShadow = false;
        AppState.globalVisualSettings.highlightGlow = false;
        AppState.globalVisualSettings.showEdgeLabel = false;
    } else if (presetName === 'colorblind') {
        // 색각보정 모드
        AppState.settings.colorBlindMode = true;
        AppState.globalVisualSettings.nodeShadow = true;
        AppState.globalVisualSettings.showEdgeLabel = true;
    }
    
    updateRelationVisualSettingsUI();
    updateGlobalVisualSettingsUI();
    updateGraphStyle();
}

// 전역 시각 효과 UI 업데이트
function updateGlobalVisualSettingsUI() {
    var globalSettings = AppState.globalVisualSettings;
    
    if (document.getElementById('node-shadow-toggle')) {
        document.getElementById('node-shadow-toggle').checked = globalSettings.nodeShadow;
    }
    if (document.getElementById('edge-curve-style')) {
        document.getElementById('edge-curve-style').value = globalSettings.edgeCurveStyle;
    }
    if (document.getElementById('highlight-glow-toggle')) {
        document.getElementById('highlight-glow-toggle').checked = globalSettings.highlightGlow;
    }
    if (document.getElementById('unselected-blur-slider')) {
        document.getElementById('unselected-blur-slider').value = globalSettings.unselectedBlur;
        document.getElementById('unselected-blur-value').textContent = globalSettings.unselectedBlur + '%';
    }
    if (document.getElementById('animation-speed-slider')) {
        document.getElementById('animation-speed-slider').value = globalSettings.animationSpeed;
        document.getElementById('animation-speed-value').textContent = globalSettings.animationSpeed.toFixed(1) + 'x';
    }
    if (document.getElementById('show-edge-label-toggle')) {
        document.getElementById('show-edge-label-toggle').checked = globalSettings.showEdgeLabel;
    }
    if (document.getElementById('hide-common-relation-labels-toggle')) {
        document.getElementById('hide-common-relation-labels-toggle').checked = globalSettings.hideCommonRelationLabels || false;
    }
    if (document.getElementById('auto-scale-edge-thickness-toggle')) {
        document.getElementById('auto-scale-edge-thickness-toggle').checked = AppState.settings.autoScaleEdgeThickness;
    }
    if (document.getElementById('node-label-size-slider')) {
        document.getElementById('node-label-size-slider').value = globalSettings.nodeLabelSize;
        document.getElementById('node-label-size-value').textContent = globalSettings.nodeLabelSize + 'px';
    }
}

// 통합 파일 처리
function processUnifiedFile(data) {
    // 엑셀 파일에서 시트로 구분된 경우
    if (data.nodes || data.edges) {
        var nodesLoaded = false;
        var edgesLoaded = false;
        
        // 노드 데이터 처리
        if (data.nodes && data.nodes.length > 0) {
            processNodesData(data.nodes, function() {
                nodesLoaded = true;
                if (edgesLoaded || !data.edges || data.edges.length === 0) {
                    // 엣지가 없거나 이미 로드되었으면 완료
                    if (AppState.nodes.length > 0 && AppState.edges.length > 0) {
                        initCytoscape();
                        updateEmptyState();
                    }
                }
            });
        } else {
            nodesLoaded = true;
        }
        
        // 엣지 데이터 처리
        if (data.edges && data.edges.length > 0) {
            processEdgesData(data.edges, function() {
                edgesLoaded = true;
                if (nodesLoaded) {
                    // 노드가 이미 로드되었으면 완료
                    if (AppState.nodes.length > 0 && AppState.edges.length > 0) {
                        initCytoscape();
                        updateEmptyState();
                    }
                }
            });
        } else {
            edgesLoaded = true;
        }
    } else {
        // 배열 형태로 받은 경우 (하위 호환성)
        if (Array.isArray(data)) {
            processNodesData(data);
        }
    }
}

// 이벤트 리스너 초기화
function initEventListeners() {
    // 통합 파일 선택
    document.getElementById('unified-file').addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (!file) return;
        
        showLoading(true);
        loadFile(file, function(data, error) {
            showLoading(false);
            if (error) {
                showError('파일 로드 오류: ' + error.message);
                return;
            }
            processUnifiedFile(data);
        });
    });
    
    // 개별 파일 선택 (하위 호환성)
    document.getElementById('nodes-file').addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (!file) return;
        
        showLoading(true);
        loadFile(file, function(data, error) {
            showLoading(false);
            if (error) {
                showError('파일 로드 오류: ' + error.message);
                return;
            }
            if (data.nodes) {
                processNodesData(data.nodes);
            } else if (Array.isArray(data)) {
                processNodesData(data);
            } else {
                processNodesData([data]);
            }
        });
    });
    
    document.getElementById('edges-file').addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (!file) return;
        
        showLoading(true);
        loadFile(file, function(data, error) {
            showLoading(false);
            if (error) {
                showError('파일 로드 오류: ' + error.message);
                return;
            }
            if (data.edges) {
                processEdgesData(data.edges);
            } else if (Array.isArray(data)) {
                processEdgesData(data);
            } else {
                processEdgesData([data]);
            }
        });
    });
    
    // 통합 샘플 데이터 로드
    document.getElementById('load-sample-unified').addEventListener('click', function() {
        // 노드와 엣지 샘플 데이터를 순차적으로 로드
        showLoading(true);
        
        // 노드 데이터 로드
        loadSampleData('nodes', function(err) {
            if (err) {
                showLoading(false);
                return;
            }
            
            // 노드 로드 완료 후 엣지 로드
            setTimeout(function() {
                loadSampleData('edges', function(err) {
                    showLoading(false);
                    if (!err && AppState.nodes.length > 0 && AppState.edges.length > 0) {
                        // 노드와 엣지가 모두 로드되었으면 Cytoscape 초기화
                        if (!AppState.cy) {
                            initCytoscape();
                        }
                    }
                });
            }, 300);
        });
    });
    
    // 검색
    var searchInput = document.getElementById('search-input');
    var searchTimeout;
    searchInput.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(function() {
            performSearch(searchInput.value);
        }, 300);
    });
    
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            clearTimeout(searchTimeout);
            performSearch(searchInput.value);
        }
    });
    
    // clear-search 버튼 제거됨 - 초기화는 사이드바 설정 섹션의 초기화 버튼으로 통합
    
    // 민감 관계 토글
    document.getElementById('sensitive-relations-toggle').addEventListener('change', function(e) {
        if (e.target.checked) {
            // 경고 모달 표시
            var modal = document.getElementById('sensitive-warning-modal');
            modal.classList.remove('hidden');
            
            document.getElementById('sensitive-warning-confirm').onclick = function() {
                modal.classList.add('hidden');
                AppState.filters.sensitiveRelations = true;
                applyFilters();
            };
            
            document.getElementById('sensitive-warning-cancel').onclick = function() {
                modal.classList.add('hidden');
                e.target.checked = false;
            };
        } else {
            AppState.filters.sensitiveRelations = false;
            applyFilters();
        }
    });
    
    // 성능 옵션
    document.getElementById('hide-low-weight-edges').addEventListener('change', function(e) {
        AppState.settings.hideLowWeightEdges = e.target.checked;
        applyFilters();
    });
    
    var edgeLimitSlider = document.getElementById('edge-limit-slider');
    edgeLimitSlider.addEventListener('input', function(e) {
        AppState.settings.edgeLimit = parseInt(e.target.value);
        document.getElementById('edge-limit-value').textContent = e.target.value;
        applyFilters();
    });
    
    // 색각보정 토글
    document.getElementById('color-blind-toggle').addEventListener('change', function(e) {
        AppState.settings.colorBlindMode = e.target.checked;
        if (e.target.checked) {
            document.body.classList.add('color-blind-mode');
        } else {
            document.body.classList.remove('color-blind-mode');
        }
        if (AppState.cy) {
            AppState.cy.style(getCytoscapeStyle());
        }
    });
    
    // 개발자 모드 토글
    var developerModeToggle = document.getElementById('developer-mode-toggle');
    if (developerModeToggle) {
        // 초기 상태 로드
        var savedDeveloperMode = localStorage.getItem('hrNetworkDeveloperMode');
        if (savedDeveloperMode === 'true') {
            AppState.settings.developerMode = true;
            developerModeToggle.checked = true;
            document.getElementById('individual-files-section').style.display = 'flex';
        }
        
        developerModeToggle.addEventListener('change', function(e) {
            AppState.settings.developerMode = e.target.checked;
            var individualSection = document.getElementById('individual-files-section');
            if (e.target.checked) {
                individualSection.style.display = 'flex';
                localStorage.setItem('hrNetworkDeveloperMode', 'true');
            } else {
                individualSection.style.display = 'none';
                localStorage.setItem('hrNetworkDeveloperMode', 'false');
            }
        });
    }
    
    // Empty State 샘플 로드 버튼
    var emptyStateLoadSample = document.getElementById('empty-state-load-sample');
    if (emptyStateLoadSample) {
        emptyStateLoadSample.addEventListener('click', function() {
            var loadSampleBtn = document.getElementById('load-sample-unified');
            if (loadSampleBtn) {
                loadSampleBtn.click();
            }
        });
    }
    
    // 초기 Empty State 표시
    updateEmptyState();
    
    // 내보내기
    document.getElementById('export-png').addEventListener('click', exportPNG);
    document.getElementById('export-svg').addEventListener('click', exportSVG);
    document.getElementById('export-csv-nodes').addEventListener('click', exportCSVNodes);
    document.getElementById('export-csv-edges').addEventListener('click', exportCSVEdges);
    
    // 랜덤 흩뿌리기
    document.getElementById('randomize-layout').addEventListener('click', function() {
        if (!AppState.cy || AppState.nodes.length === 0) {
            alert('데이터가 로드되지 않았습니다.');
            return;
        }
        
        randomizeLayout();
    });
    
    // 설정 저장/복원
    document.getElementById('save-settings').addEventListener('click', saveSettings);
    document.getElementById('load-settings').addEventListener('click', function() {
        loadSettings(true); // 사용자가 명시적으로 클릭한 경우에만 알림 표시
    });
    document.getElementById('reset-settings').addEventListener('click', resetSettings);
    
    // 노드 시각 효과
    document.getElementById('centrality-based-size-toggle').addEventListener('change', function(e) {
        AppState.settings.centralityBasedSize = e.target.checked;
        updateGraphStyle();
    });
    
    document.getElementById('department-colors-toggle').addEventListener('change', function(e) {
        AppState.settings.departmentColors = e.target.checked;
        updateGraphStyle();
    });
    
    // 관계별 시각화 설정 UI 업데이트
    updateRelationVisualSettingsUI();
    
    // 관계별 설정 초기화
    document.getElementById('reset-visual-settings').addEventListener('click', function() {
        if (!confirm('모든 관계별 시각화 설정을 초기화하시겠습니까?')) return;
        applyPreset('default');
        updateRelationVisualSettingsUI();
    });
    
    // 전역 시각 효과
    document.getElementById('node-shadow-toggle').addEventListener('change', function(e) {
        AppState.globalVisualSettings.nodeShadow = e.target.checked;
        updateGraphStyle();
    });
    
    document.getElementById('edge-curve-style').addEventListener('change', function(e) {
        AppState.globalVisualSettings.edgeCurveStyle = e.target.value;
        updateGraphStyle();
    });
    
    document.getElementById('highlight-glow-toggle').addEventListener('change', function(e) {
        AppState.globalVisualSettings.highlightGlow = e.target.checked;
        updateGraphStyle();
    });
    
    var unselectedBlurSlider = document.getElementById('unselected-blur-slider');
    unselectedBlurSlider.addEventListener('input', function(e) {
        AppState.globalVisualSettings.unselectedBlur = parseInt(e.target.value);
        document.getElementById('unselected-blur-value').textContent = e.target.value + '%';
        updateGraphStyle();
    });
    
    var animationSpeedSlider = document.getElementById('animation-speed-slider');
    animationSpeedSlider.addEventListener('input', function(e) {
        AppState.globalVisualSettings.animationSpeed = parseFloat(e.target.value);
        document.getElementById('animation-speed-value').textContent = parseFloat(e.target.value).toFixed(1) + 'x';
        updateGraphStyle();
    });
    
    document.getElementById('show-edge-label-toggle').addEventListener('change', function(e) {
        AppState.globalVisualSettings.showEdgeLabel = e.target.checked;
        updateGraphStyle();
    });
    
    // 일반 관계 레이블 숨기기 토글
    var hideCommonLabelsToggle = document.getElementById('hide-common-relation-labels-toggle');
    if (hideCommonLabelsToggle) {
        hideCommonLabelsToggle.addEventListener('change', function(e) {
            AppState.globalVisualSettings.hideCommonRelationLabels = e.target.checked;
            updateGraphStyle();
        });
    }
    
    document.getElementById('auto-scale-edge-thickness-toggle').addEventListener('change', function(e) {
        AppState.settings.autoScaleEdgeThickness = e.target.checked;
        updateGraphStyle();
    });
    
    var nodeLabelSizeSlider = document.getElementById('node-label-size-slider');
    nodeLabelSizeSlider.addEventListener('input', function(e) {
        AppState.globalVisualSettings.nodeLabelSize = parseInt(e.target.value);
        document.getElementById('node-label-size-value').textContent = e.target.value + 'px';
        updateGraphStyle();
    });
    
    // 프리셋
    document.getElementById('apply-preset').addEventListener('click', function() {
        var presetSelect = document.getElementById('preset-select');
        applyPreset(presetSelect.value);
    });
    
    document.getElementById('save-custom-preset').addEventListener('click', function() {
        try {
            var preset = {
                visualSettings: JSON.parse(JSON.stringify(AppState.visualSettings)),
                globalVisualSettings: JSON.parse(JSON.stringify(AppState.globalVisualSettings)),
                settings: JSON.parse(JSON.stringify(AppState.settings))
            };
            localStorage.setItem('hrNetworkCustomPreset', JSON.stringify(preset));
            alert('현재 설정이 저장되었습니다.');
        } catch (error) {
            alert('설정 저장 중 오류가 발생했습니다: ' + error.message);
        }
    });
    
    document.getElementById('load-custom-preset').addEventListener('click', function() {
        try {
            var saved = localStorage.getItem('hrNetworkCustomPreset');
            if (!saved) {
                alert('저장된 설정이 없습니다.');
                return;
            }
            
            var preset = JSON.parse(saved);
            AppState.visualSettings = preset.visualSettings;
            AppState.globalVisualSettings = preset.globalVisualSettings;
            AppState.settings = Object.assign({}, AppState.settings, preset.settings);
            
            updateRelationVisualSettingsUI();
            updateGlobalVisualSettingsUI();
            document.getElementById('centrality-based-size-toggle').checked = AppState.settings.centralityBasedSize;
            document.getElementById('department-colors-toggle').checked = AppState.settings.departmentColors;
            document.getElementById('color-blind-toggle').checked = AppState.settings.colorBlindMode;
            
            updateGraphStyle();
            alert('저장된 설정이 불러와졌습니다.');
        } catch (error) {
            alert('설정 불러오기 중 오류가 발생했습니다: ' + error.message);
        }
    });
    
    // 전역 시각 효과 UI 초기화
    updateGlobalVisualSettingsUI();
}

// 초기화
function init() {
    initEventListeners();
    
    // 저장된 설정 불러오기
    try {
        loadSettings();
    } catch (error) {
        // 무시
    }
}

// DOM 로드 완료 시 초기화
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

