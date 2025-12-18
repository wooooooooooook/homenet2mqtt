import yaml from 'js-yaml';

// CEL 표현식으로 대체되어 !homenet_logic YAML 태그는 더 이상 사용되지 않습니다.
// 기본 YAML 스키마를 그대로 사용합니다.
export const HOMENET_BRIDGE_SCHEMA = yaml.DEFAULT_SCHEMA;
