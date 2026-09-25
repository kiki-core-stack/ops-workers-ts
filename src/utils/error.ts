// TODO: 移動到pack 或node-shared
export const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
