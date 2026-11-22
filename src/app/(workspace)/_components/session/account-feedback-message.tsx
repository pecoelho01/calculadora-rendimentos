type AccountFeedbackMessageProps = {
  message: string;
  error: string;
  hasForm: boolean;
};

export function AccountFeedbackMessage({
  message,
  error,
  hasForm,
}: AccountFeedbackMessageProps) {
  return (
    <>
      {message && (
        <p
          className="account-feedback"
          role="status"
        >
          {message}
        </p>
      )}
      {error && !hasForm && (
        <p
          className="account-feedback form-error"
          role="alert"
        >
          {error}
        </p>
      )}
    </>
  );
}
