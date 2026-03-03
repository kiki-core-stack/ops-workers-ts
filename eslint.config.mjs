import { antfu } from '@antfu/eslint-config';
import { createBaseConfigs } from '@kikiutils/eslint-config/base';
import { createVsCodeJsonConfigs } from '@kikiutils/eslint-config/json';

export default antfu({ typescript: true }, createBaseConfigs('bun'), createVsCodeJsonConfigs());
