import { antfu } from '@antfu/eslint-config';
import { createBaseConfigs } from '@kikiutils/eslint-config/base';

export default antfu({ typescript: true }, createBaseConfigs('bun'));
