export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, code = 'bad_request', details?: unknown) => new ApiError(400, code, message, details);
export const unauthorized = (message = 'Sign in again.') => new ApiError(401, 'unauthorized', message);
export const forbidden = (message = 'You can’t do that.') => new ApiError(403, 'forbidden', message);
export const notFound = (what = 'Not found') => new ApiError(404, 'not_found', what);
export const conflict = (message: string, code = 'conflict') => new ApiError(409, code, message);
/** A rule in src/domain said no. */
export const ruleViolation = (message: string, code = 'rule_violation', details?: unknown) => new ApiError(422, code, message, details);
export const tooMany = (message: string) => new ApiError(429, 'rate_limited', message);
