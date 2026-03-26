type SendEmailInput = {
  html: string;
  subject: string;
  text: string;
  to: string;
};

export type IdentityEmailSender = {
  send(input: SendEmailInput): Promise<void>;
};

type ResendEmailSenderOptions = {
  apiKey: string;
  from: string;
  replyTo?: string;
};

export function createNoopEmailSender(): IdentityEmailSender {
  return {
    async send() {
      return;
    },
  };
}

export function createResendEmailSender(options: ResendEmailSenderOptions): IdentityEmailSender {
  return {
    async send(input) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: options.from,
          html: input.html,
          subject: input.subject,
          text: input.text,
          to: [input.to],
          ...(options.replyTo ? { reply_to: options.replyTo } : {}),
        }),
      });

      if (response.ok) {
        return;
      }

      const payload = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;

      throw new Error(payload?.message ?? `Resend request failed with status ${response.status}`);
    },
  };
}
