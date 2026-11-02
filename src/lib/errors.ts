/** Errors whose message is safe to show to the user. Anything else is reported generically. */
export class UserError extends Error {
  constructor(message: string, public code = "invalid") {
    super(message);
    this.name = "UserError";
  }
}
export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "ForbiddenError";
  }
}
export class AllocationError extends UserError {
  constructor(message = "Sorry — the selected accommodation is no longer available for these dates.") {
    super(message, "unavailable");
    this.name = "AllocationError";
  }
}

export function safeMessage(e: unknown): string {
  if (e instanceof UserError || e instanceof ForbiddenError) return e.message;
  console.error(e);
  return "Something went wrong. Please try again or contact us.";
}
