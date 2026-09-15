const resendApiUrl = "https://api.resend.com/emails";
export async function sendVerificationEmail(email: string, otp: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from || !/^\S+@\S+\.\S+$/.test(from)) throw new Error("RESEND_API_KEY and a valid EMAIL_FROM are required for email OTP.");
  const response = await fetch(resendApiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Your Farm2Fork verification code",
      text: `Your Farm2Fork verification code is ${otp}. It expires in 10 minutes.`,
    }),
  });

  if (!response.ok) {
    let category = "unknown";

    try {
      const errorData = (await response.json()) as { name?: unknown };

      if (
        typeof errorData?.name === "string" &&
        /^[A-Za-z0-9\_-]{1,80}$/.test(errorData.name)
      ) {
        category = errorData.name;
      }
    } catch {
      // Keep category as unknown.
    }

    console.error(
      `[Resend] Email delivery failed: status=${response.status} category=${category}`
    );

    throw new Error("Email delivery failed.");
  }
}
