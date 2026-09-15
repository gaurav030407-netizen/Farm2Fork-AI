export type SmsProvider = { sendOtp: (phoneNumber: string, otp: string) => Promise<void> };

class Msg91SmsProvider implements SmsProvider {
  async sendOtp(phoneNumber: string, otp: string): Promise<void> {
    const apiKey = process.env.SMS_API_KEY?.trim();
    const senderId = process.env.SMS_SENDER_ID?.trim();
    const templateId = process.env.SMS_TEMPLATE_ID?.trim();
    if (process.env.SMS_TEST_MODE === "true") return;
    if (!apiKey || !senderId || !templateId) throw new Error("MSG91 SMS requires SMS_API_KEY, SMS_SENDER_ID, and SMS_TEMPLATE_ID.");
    const response = await fetch("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: { authkey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ template_id: templateId, sender: senderId, recipients: [{ mobiles: phoneNumber.replace(/^\+/, ""), OTP: otp }] }),
    });
    if (!response.ok) throw new Error("SMS provider rejected the OTP request.");
  }
}

class TestSmsProvider implements SmsProvider {
  async sendOtp(_phoneNumber: string, _otp: string): Promise<void> {}
}

const providerName = process.env.SMS_PROVIDER?.trim().toLowerCase();
export const smsProvider: SmsProvider = providerName === "test" ? new TestSmsProvider() : new Msg91SmsProvider();

export function isSmsProviderConfigured(): boolean {
  if (process.env.SMS_TEST_MODE === "true" && providerName === "test") return true;
  return providerName === "msg91"
    && Boolean(process.env.SMS_API_KEY?.trim())
    && Boolean(process.env.SMS_SENDER_ID?.trim())
    && Boolean(process.env.SMS_TEMPLATE_ID?.trim());
}
