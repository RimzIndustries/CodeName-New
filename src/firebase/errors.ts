
// Defines custom error types for the application.

export type SecurityRuleContext = {
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete' | 'write' | 'session-setup';
  requestResourceData?: any;
};

export class FirestorePermissionError extends Error {
  public context: SecurityRuleContext;

  constructor(context: SecurityRuleContext) {
    const message = `FirestoreError: Missing or insufficient permissions: The following request was denied by Firestore Security Rules:\n${JSON.stringify(
      {
        context: {
          path: context.path,
          operation: context.operation,
          data: context.requestResourceData,
        },
      },
      null,
      2
    )}`;
    super(message);
    this.name = 'FirestorePermissionError';
    this.context = context;

    // This is necessary for transitioning to a custom error in TypeScript.
    Object.setPrototypeOf(this, FirestorePermissionError.prototype);
  }
}
