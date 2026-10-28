export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string = " INTERNAL_ERROR",
    public readonly details?: any,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(404, message, "NOT_FOUND");
  }
}
