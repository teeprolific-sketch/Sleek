/** OTP delivery. Production: Termii / Africa's Talking / WhatsApp OTP. */
export interface SmsProvider {
  sendOtp(phone: string, code: string): Promise<void>;
}

export class ConsoleSms implements SmsProvider {
  sent: { phone: string; code: string }[] = [];
  constructor(private log = false) {}
  async sendOtp(phone: string, code: string) {
    this.sent.push({ phone, code });
    if (this.log) console.log(`[sms] OTP for ${phone}: ${code}`);
  }
}
