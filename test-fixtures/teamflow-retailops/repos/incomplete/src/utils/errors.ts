export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
  }
}

export function assertRequired<T>(value: T | null | undefined, fieldName: string): T {
  if (value === null || value === undefined || value === "") {
    throw new AppError(`${fieldName} is required`, 400);
  }

  return value;
}
