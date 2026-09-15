import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { Edit3, Upload } from "lucide-react";
import { Button, Feedback, SectionTitle } from "@/components/ui-kit";
import {
  ProfileAvatar,
  ProfileCompletion,
  VerificationBadges,
} from "@/components/profile-ui";
import { PanVerificationSection } from "@/components/pan-verification-section";
import { LocationSelector } from "@/components/location-selector";
import { profilesApi, type UserProfile } from "@/lib/profiles";
import { useAuth } from "@/lib/auth";

function ProfileView({
  profile,
  editable = false,
}: {
  profile: UserProfile;
  editable?: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-5 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 sm:flex-row sm:items-center">
        <ProfileAvatar src={profile.profile_photo_url} name={profile.name} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">
            {profile.role === "FARMER" ? "Farmer" : profile.role === "DRIVER" ? "Driver" : profile.role === "CONSUMER" ? "Consumer" : "Bulk Buyer"}
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold">
            {profile.name}
          </h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            {profile.city || profile.location || "Location not added"}
            {profile.state ? `, ${profile.state}` : ""}
          </p>
          <div className="mt-3">
            <VerificationBadges emailVerified={profile.email_verified} phoneVerified={profile.phone_verified} />
          </div>
        </div>
        {editable && (
          <Link href="/profile/edit">
            <Button variant="secondary">
              <Edit3 size={15} /> Edit profile
            </Button>
          </Link>
        )}
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <h2 className="font-bold">About</h2>
          <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">
            {profile.bio ||
              "Add a short introduction to build trust with the Farm2Fork community."}
          </p>
        </div>
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <ProfileCompletion percent={profile.completion_percent} />
        </div>
      </div>
      {profile.role === "FARMER" ? (
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <h2 className="font-bold">Farm & Harvest details</h2>
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <span className="text-[hsl(var(--muted-foreground))]">Crops</span>
              <div className="font-semibold">{profile.crops_grown || "Not added"}</div>
            </div>
            <div>
              <span className="text-[hsl(var(--muted-foreground))]">Experience</span>
              <div className="font-semibold">{profile.farming_experience || "Not added"}</div>
            </div>
            <div><span className="text-[hsl(var(--muted-foreground))]">Farm size</span><div className="font-semibold">{profile.farm_size ? `${profile.farm_size} ${profile.farm_size_unit || "acres"}` : "Not added"}</div></div>
            <div><span className="text-[hsl(var(--muted-foreground))]">Farming type</span><div className="font-semibold">{profile.farming_type || "Not added"}</div></div>
            <div className="sm:col-span-2">
              <span className="text-[hsl(var(--muted-foreground))]">Description</span>
              <div className="font-semibold">{profile.farm_description || "Not added"}</div>
            </div>
          </div>
        </div>
      ) : profile.role === "DRIVER" ? (
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <h2 className="font-bold">Driver details</h2>
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div><span className="text-[hsl(var(--muted-foreground))]">Service area</span><div className="font-semibold">{profile.service_area || profile.location || "Not specified"}</div></div>
            <div><span className="text-[hsl(var(--muted-foreground))]">Vehicle type</span><div className="font-semibold">{profile.vehicle_type || "Unspecified"}</div></div>
            <div><span className="text-[hsl(var(--muted-foreground))]">Vehicle registration</span><div className="font-semibold">{profile.vehicle_registration || "Not added"}</div></div>
            <div><span className="text-[hsl(var(--muted-foreground))]">Approval status</span><div className="font-semibold">{profile.approval_status || "PENDING"}</div></div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <h2 className="font-bold">{profile.role === "CONSUMER" ? "Consumer details" : "Bulk Buyer information"}</h2>
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <span className="text-[hsl(var(--muted-foreground))]">Business / Organization</span>
              <div className="font-semibold">{profile.business_name || "Not added"}</div>
            </div>
            <div><span className="text-[hsl(var(--muted-foreground))]">Delivery address</span><div className="font-semibold">{profile.delivery_address || "Not added"}</div></div>
            <div>
              <span className="text-[hsl(var(--muted-foreground))]">Interested crops</span>
              <div className="font-semibold">{profile.preferred_crops || profile.purchasing_interests || "Not added"}</div>
            </div>
            <div>
              <span className="text-[hsl(var(--muted-foreground))]">{profile.role === "CONSUMER" ? "Consumer type" : "Bulk Buyer type"}</span>
              <div className="font-semibold">{profile.buyer_type || (profile.role === "CONSUMER" ? "Household Consumer" : "Wholesale / Retail Buyer")}</div>
            </div>
          </div>
        </div>
      )}
      <PanVerificationSection />
      {editable && <ContactChangePanel profile={profile} />}
      {editable && <SecuritySettingsPanel profile={profile} />}
      {editable && <DeleteAccountPanel profile={profile} />}
    </div>
  );
}

function SecuritySettingsPanel({ profile }: { profile: UserProfile }) {
  const auth = useAuth();
  const [, setLocation] = useLocation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordFeedback, setPasswordFeedback] = useState<string | null>(null);
  const [passwordPending, setPasswordPending] = useState(false);

  const [otpMethod, setOtpMethod] = useState<"EMAIL" | "SMS">(profile.preferred_otp_method === "SMS" ? "SMS" : "EMAIL");
  const [otpFeedback, setOtpFeedback] = useState<string | null>(null);
  const [otpPending, setOtpPending] = useState(false);

  const [sessionFeedback, setSessionFeedback] = useState<string | null>(null);
  const [sessionPending, setSessionPending] = useState(false);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) { setPasswordFeedback("Enter your current password."); return; }
    if (newPassword.length < 8) { setPasswordFeedback("New password must be at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { setPasswordFeedback("New passwords do not match."); return; }
    setPasswordPending(true);
    setPasswordFeedback(null);
    try {
      await auth.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordFeedback("Password changed successfully.");
    } catch (err) {
      setPasswordFeedback(err instanceof Error ? err.message : "Password change failed.");
    } finally {
      setPasswordPending(false);
    }
  };

  const submitOtpMethod = async (method: "EMAIL" | "SMS") => {
    setOtpMethod(method);
    setOtpPending(true);
    setOtpFeedback(null);
    try {
      await auth.updateSecuritySettings(method);
      setOtpFeedback(`Preferred OTP delivery updated to ${method === "EMAIL" ? "Email" : "SMS"}.`);
    } catch (err) {
      setOtpFeedback(err instanceof Error ? err.message : "Could not update OTP preference.");
    } finally {
      setOtpPending(false);
    }
  };

  const handleLogoutAll = async () => {
    setSessionPending(true);
    setSessionFeedback(null);
    try {
      await auth.logoutAllDevices();
      setLocation("/login");
    } catch (err) {
      setSessionFeedback(err instanceof Error ? err.message : "Could not log out from all devices.");
    } finally {
      setSessionPending(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 space-y-6">
      <div>
        <h2 className="font-bold">Security & Login settings</h2>
        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">Manage your credentials, login preferences, and active sessions.</p>
      </div>

      <div className="border-t border-[hsl(var(--border))] pt-4">
        <h3 className="text-sm font-semibold mb-3">Change password</h3>
        <form onSubmit={submitPassword} className="grid gap-3 sm:grid-cols-3 max-w-2xl">
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Current password"
            className="min-h-11 rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password (min 8 chars)"
            className="min-h-11 rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            className="min-h-11 rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm"
          />
          <div className="sm:col-span-3 flex items-center justify-between gap-3">
            <Button type="submit" disabled={passwordPending || !currentPassword || !newPassword}>
              {passwordPending ? "Updating..." : "Update password"}
            </Button>
            {passwordFeedback && (
              <div className="flex-1">
                <Feedback
                  message={passwordFeedback}
                  kind={passwordFeedback.includes("success") ? "success" : "error"}
                />
              </div>
            )}
          </div>
        </form>
      </div>

      <div className="border-t border-[hsl(var(--border))] pt-4">
        <h3 className="text-sm font-semibold mb-1">Preferred OTP Login Method</h3>
        <p className="text-xs text-[hsl(var(--muted-foreground))] mb-3">Choose how verification codes are sent during passwordless sign-in.</p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void submitOtpMethod("EMAIL")}
            disabled={otpPending}
            className={`rounded-xl border px-4 py-2 text-xs font-bold transition-colors ${
              otpMethod === "EMAIL"
                ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-white"
                : "border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]"
            }`}
          >
            Email OTP
          </button>
          <button
            type="button"
            onClick={() => void submitOtpMethod("SMS")}
            disabled={otpPending}
            className={`rounded-xl border px-4 py-2 text-xs font-bold transition-colors ${
              otpMethod === "SMS"
                ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-white"
                : "border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]"
            }`}
          >
            SMS OTP
          </button>
        </div>
        {otpFeedback && (
          <div className="mt-2">
            <Feedback message={otpFeedback} kind={otpFeedback.includes("updated") ? "success" : "error"} />
          </div>
        )}
      </div>

      <div className="border-t border-[hsl(var(--border))] pt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Active Sessions</h3>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Sign out across all other devices or browsers.</p>
        </div>
        <Button variant="secondary" onClick={() => void handleLogoutAll()} disabled={sessionPending}>
          {sessionPending ? "Signing out..." : "Sign out from all devices"}
        </Button>
        {sessionFeedback && (
          <div className="w-full">
            <Feedback message={sessionFeedback} kind="error" />
          </div>
        )}
      </div>
    </div>
  );
}

function ContactChangePanel({ profile }: { profile: UserProfile }) {
  const auth = useAuth();
  const [type, setType] = useState<"EMAIL" | "PHONE">("PHONE");
  const [value, setValue] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submit = async () => {
    setPending(true); setFeedback(null);
    try {
      if (!sent) { await auth.changeContact(type, value); setSent(true); setFeedback("Verification code sent to the new contact."); }
      else { await auth.changeContact(type, value, otp); setSent(false); setValue(""); setOtp(""); setFeedback("Contact updated and verified."); }
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Contact verification could not be completed."); }
    finally { setPending(false); }
  };
  return <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
    <h2 className="font-bold">Account contacts</h2>
    <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
      <div><span className="text-[hsl(var(--muted-foreground))]">Email</span><div className="font-semibold">{profile.email || "Not added"} {profile.email_verified && <span className="text-[hsl(var(--primary))]">Verified</span>}</div></div>
      <div><span className="text-[hsl(var(--muted-foreground))]">Mobile</span><div className="font-semibold">{profile.mobile || "Not added"} {profile.phone_verified && <span className="text-[hsl(var(--primary))]">Verified</span>}</div></div>
    </div>
    <div className="mt-5 flex flex-wrap gap-2">{(["PHONE", "EMAIL"] as const).map((item) => <button type="button" key={item} onClick={() => { setType(item); setSent(false); setFeedback(null); }} className={`rounded-xl border px-3 py-2 text-xs font-bold ${type === item ? "border-[hsl(var(--primary))] text-[hsl(var(--primary))]" : "border-[hsl(var(--border))]"}`}>{item === "PHONE" ? "Change mobile" : "Change email"}</button>)}</div>
    <div className="mt-3 flex flex-col gap-3 sm:flex-row"><input value={value} onChange={(event) => setValue(event.target.value)} disabled={sent} placeholder={type === "PHONE" ? "New mobile number" : "New email address"} type={type === "PHONE" ? "tel" : "email"} className="min-h-11 flex-1 rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm" />{sent && <input value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit OTP" inputMode="numeric" className="min-h-11 flex-1 rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm" />}<Button onClick={() => void submit()} disabled={pending || (!sent && !value) || (sent && otp.length !== 6)}>{pending ? "Working..." : sent ? "Verify and change" : "Send OTP"}</Button></div>
    {feedback && <div className="mt-3"><Feedback message={feedback} kind={feedback.includes("updated") || feedback.includes("sent") ? "success" : "error"} /></div>}
  </div>;
}

function DeleteAccountPanel({ profile }: { profile: UserProfile }) {
  const auth = useAuth();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [authMethod, setAuthMethod] = useState<"PASSWORD" | "OTP">("PASSWORD");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState(false);

  const deleteNow = async () => {
    setPending(true);
    setFeedback("");
    try {
      await auth.deleteAccount(confirmation, authMethod === "PASSWORD" ? { password } : { otp });
      setLocation("/login");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Account deletion could not be completed.");
    } finally {
      setPending(false);
    }
  };

  const requestOtp = async () => {
    const method = profile.phone_verified ? "SMS" : "EMAIL";
    const identifier = method === "SMS" ? profile.mobile : profile.email;
    if (!identifier) {
      setFeedback("No verified phone number or email is available for OTP re-authentication.");
      return;
    }
    setPending(true);
    setFeedback("");
    try {
      await auth.sendLoginOtp(method, identifier);
      setOtpSent(true);
      setFeedback(`A re-authentication OTP was sent to your verified ${method === "SMS" ? "mobile" : "email"}.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not send re-authentication OTP.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50/60 p-5">
      <h2 className="font-bold text-red-900">Danger zone</h2>
      <p className="mt-2 text-sm text-red-800">
        Deleting your account is permanent and destructive. All active listings will be removed. Historical financial and legal records will remain anonymized to satisfy audit compliance.
      </p>
      <Button
        variant="danger"
        className="mt-4"
        onClick={() => {
          setOpen(true);
          setFeedback("");
          setConfirmation("");
          setPassword("");
          setOtp("");
          setOtpSent(false);
        }}
      >
        Delete Account
      </Button>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-5">
          <div className="w-full max-w-lg rounded-2xl bg-[hsl(var(--card))] p-6 shadow-2xl space-y-4">
            <div>
              <h3 className="font-display text-2xl font-bold text-red-600">Permanently Delete Account</h3>
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                This action cannot be undone. Please confirm by typing DELETE and re-authenticating your identity.
              </p>
            </div>

            <div>
              <label className="text-xs font-bold text-[hsl(var(--muted-foreground))] block mb-1">
                Type DELETE to confirm
              </label>
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder="DELETE"
                className="min-h-11 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm font-mono uppercase"
              />
            </div>

            <div className="border-t border-[hsl(var(--border))] pt-3">
              <label className="text-xs font-bold text-[hsl(var(--muted-foreground))] block mb-2">
                Re-authenticate your identity
              </label>
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => { setAuthMethod("PASSWORD"); setFeedback(""); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${authMethod === "PASSWORD" ? "bg-[hsl(var(--primary))] text-white" : "border"}`}
                >
                  Password
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthMethod("OTP"); setFeedback(""); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${authMethod === "OTP" ? "bg-[hsl(var(--primary))] text-white" : "border"}`}
                >
                  Verified OTP
                </button>
              </div>

              {authMethod === "PASSWORD" ? (
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  placeholder="Enter your account password"
                  className="min-h-11 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm"
                />
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      value={otp}
                      onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      inputMode="numeric"
                      placeholder="6-digit OTP"
                      className="min-h-11 flex-1 rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm font-mono text-center tracking-widest"
                    />
                    <Button type="button" variant="secondary" onClick={() => void requestOtp()} disabled={pending}>
                      {otpSent ? "Resend OTP" : "Send OTP"}
                    </Button>
                  </div>
                  <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                    Code will be sent to your verified {profile.phone_verified ? "mobile" : "email"}.
                  </p>
                </div>
              )}
            </div>

            {feedback && (
              <Feedback
                message={feedback}
                kind={feedback.includes("sent") ? "success" : "error"}
              />
            )}

            <div className="mt-5 flex justify-end gap-2 border-t border-[hsl(var(--border))] pt-4">
              <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={
                  pending ||
                  confirmation !== "DELETE" ||
                  (authMethod === "PASSWORD" ? !password : otp.length !== 6)
                }
                onClick={() => void deleteNow()}
              >
                {pending ? "Deleting..." : "Permanently Delete Account"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ProfilePage() {
  const { profile: authProfile } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void profilesApi
      .getMe()
      .then(setProfile)
      .catch(() => setError("Unable to load your profile. Please try again."));
  }, []);
  if (error) return <Feedback message={error} kind="error" />;
  return (
    <>
      <SectionTitle
        eyebrow="Your identity"
        title="Your profile"
        detail="Build trust with the people behind each transaction."
      />
      {profile ? (
        <ProfileView profile={profile} editable />
      ) : (
        <div className="animate-pulse rounded-2xl bg-[hsl(var(--muted))] p-12" />
      )}
    </>
  );
}

export function PublicProfilePage() {
  const { userId = "" } = useParams<{ userId: string }>();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void profilesApi
      .getPublic(userId)
      .then(setProfile)
      .catch(() => setError("This profile could not be loaded."));
  }, [userId]);
  if (error) return <Feedback message={error} kind="error" />;
  return profile ? (
    <ProfileView profile={profile} />
  ) : (
    <div className="animate-pulse rounded-2xl bg-[hsl(var(--muted))] p-12" />
  );
}

export function EditProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    void profilesApi
      .getMe()
      .then((value) => {
        setProfile(value);
        setForm({
          name: value.name,
          mobile: value.mobile || "",
          city: value.city || "",
          state: value.state || "",
          bio: value.bio || "",
          address: value.address || "", locality: value.locality || "", landmark: value.landmark || "", pin_code: value.pin_code || "", latitude: value.latitude == null ? "" : String(value.latitude), longitude: value.longitude == null ? "" : String(value.longitude),
          ...(value.role === "FARMER"
            ? {
                farm_location: value.farm_location || "",
                crops_grown: value.crops_grown || "",
                farming_experience: value.farming_experience || "",
                farm_description: value.farm_description || "",
                farm_size: value.farm_size == null ? "" : String(value.farm_size), farm_size_unit: value.farm_size_unit || "acres", farming_type: value.farming_type || "",
              }
            : {
                business_name: value.business_name || "",
                buyer_type: value.buyer_type || "",
                purchasing_interests: value.purchasing_interests || "",
                preferred_crops: value.preferred_crops || "",
                business_location: value.business_location || "",
                delivery_address: value.delivery_address || "",
              }),
        });
      })
      .catch(() => setFeedback("Unable to load your profile."));
  }, []);
  const update = (key: string, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const locationValues = { address: form.address || "", locality: form.locality || "", landmark: form.landmark || "", city: form.city || "", state: form.state || "", pin_code: form.pin_code || "", latitude: form.latitude || "", longitude: form.longitude || "" };
  const save = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const payload = Object.fromEntries(
        Object.entries(form).map(([key, value]) => {
          const trimmed = value.trim();
          if (trimmed === "") return [key, null];
          if (["farm_size", "latitude", "longitude"].includes(key)) {
            const numeric = Number(trimmed);
            return [key, Number.isFinite(numeric) ? numeric : null];
          }
          return [key, trimmed];
        })
      );
      const value = await profilesApi.update(payload);
      setProfile(value);
      setFeedback("Profile saved.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Profile could not be saved. Please try again.";
      setFeedback(import.meta.env.DEV ? detail : "Profile could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };
  const upload = async (file: File) => {
    setUploading(true);
    setFeedback(null);
    try {
      setProfile(await profilesApi.uploadPhoto(file));
    } catch {
      setFeedback("Photo upload failed. Use a JPG, PNG, or WebP under 5 MB.");
    } finally {
      setUploading(false);
    }
  };
  if (!profile)
    return (
      <div className="animate-pulse rounded-2xl bg-[hsl(var(--muted))] p-12" />
    );
  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Account settings"
        title="Complete your profile"
        detail="Add your photo and basic details to build trust."
      />
      {feedback && (
        <Feedback
          message={feedback}
          kind={feedback === "Profile saved." ? "success" : "error"}
        />
      )}
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <div className="flex items-center gap-4">
          <ProfileAvatar src={profile.profile_photo_url} name={profile.name} />
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[hsl(var(--border))] px-4 py-2 text-sm font-semibold">
            <Upload size={15} /> {uploading ? "Uploading..." : "Upload photo"}
            <input
              className="hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
          </label>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {Object.entries(form).filter(([key]) => !["address", "locality", "landmark", "city", "state", "pin_code", "latitude", "longitude"].includes(key)).map(([key, value]) => (
            <label key={key} className="text-sm font-semibold">
              <span className="mb-1 block capitalize">
                {key.replaceAll("_", " ")}
              </span>
              <input
                value={value}
                onChange={(event) => update(key, event.target.value)}
                className="min-h-11 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3"
              />
            </label>
          ))}
        </div>
        <Button className="mt-6" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving..." : "Save profile"}
        </Button>
      </div>
      <LocationSelector title={profile.role === "FARMER" ? "Farm location" : "Delivery address"} values={locationValues} onChange={update} />
      <PanVerificationSection />
    </div>
  );
}
