import yaml, { Type } from 'js-yaml';

// Define a custom YAML type for !homenet_logic
const HOMENET_LOGIC_TYPE = new Type('!homenet_logic', {
  kind: 'mapping', // It's a mapping (object), not a scalar
  construct: function (data) {
    // data will be the parsed object under !homenet_logic
    // We can directly return it as it should conform to CommandLambdaConfig or StateLambdaConfig
    return data;
  },
});

// Create a schema that includes the custom HOMENET_LOGIC_TYPE
export const HOMENET_BRIDGE_SCHEMA = yaml.DEFAULT_SCHEMA.extend([HOMENET_LOGIC_TYPE]);
