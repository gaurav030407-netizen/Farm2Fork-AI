import { type ReactNode, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Download,
  Eye,
  Globe,
  HandCoins,
  Landmark,
  Leaf,
  MapPin,
  MessageCircle,
  Package,
  PackageSearch,
  Pencil,
  Play,
  Plus,
  Route,
  Search,
  ShieldCheck,
  Sprout,
  Store,
  Trash2,
  TrendingUp,
  Truck,
  Scale,
  User,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { MarketPriceAssistant } from "@/components/ai/market-price-assistant";
import {
  getGetDashboardQueryKey,
  getGetFarmerListingQueryKey,
  getGetOrderQueryKey,
  getListCropsQueryKey,
  getListFarmerListingsQueryKey,
  getListFarmerOrdersQueryKey,
  getListMarketplaceListingsQueryKey,
  getListOrdersQueryKey,
  useCreateCrop,
  useCreateFarmerListing,
  useCreateLogisticsPlan,
  useCreateOrder,
  useGetOrder,
  useGetDashboard,
  useGetFarmerListing,
  useGetMarketplaceListing,
  useGetMarketInsights,
  useHealthCheck,
  useListCrops,
  useListFarmerListings,
  useListFarmerOrders,
  useListMarketplaceListings,
  useListOrders,
  useCancelOrder,
  useUpdateCrop,
  useUpdateFarmerListing,
  useUpdateFarmerOrderStatus,
  type Crop,
  type FarmerListing,
  type FarmerListingInput,
  type Order,
} from "@workspace/api-client-react";
import { AppRole, Logo, RoleSwitcher } from "@/components/farm-shell";
import {
  Badge,
  Button,
  Feedback,
  LoadingButton,
  QueryState,
  SectionTitle,
  StatCard,
} from "@/components/ui-kit";
import { useLanguage } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { messagesApi } from "@/lib/messages";
import { createPayment, verifyPayment } from "@/lib/payments";
import { useCall } from "@/hooks/useCall";
import { getMarketPrices, type MarketPriceRecord } from "@/lib/market-data";
import { ActiveCallDialog } from "@/components/calling/ActiveCallDialog";
import { CallButton } from "@/components/calling/CallButton";
import { CallStatus } from "@/components/calling/CallStatus";
import { IncomingCallDialog } from "@/components/calling/IncomingCallDialog";
import {
  deleteFarmerListing,
  farmerListingError,
  uploadFarmerListingImage,
  uploadFarmerListingMedia,
} from "@/lib/farmer-listings";
import { StateDistrictSelector } from "@/components/state-district-selector";
import { INDIAN_STATES, getDistrictsForState } from "@/lib/indian-locations";
import { LanguageSelector } from "@/components/language-selector";
import { FarmDeliveryVisual } from "@/components/farm-delivery-visual";
import { profilesApi } from "@/lib/profiles";

/**
 * Strict Anti-Duplication Rule:
 * A variety must NEVER repeat the crop name (e.g. Potato -> Potato, Rice -> Rice).
 * If official source does not provide a variety or if it repeats crop, returns "Other / Not specified".
 */
export function displayVariety(cropName?: string | null, varietyName?: string | null): string {
  if (!varietyName || !varietyName.trim()) return "Other / Not specified";
  const normCrop = (cropName ?? "").trim().toLowerCase();
  const normVar = varietyName.trim().toLowerCase();
  if (normVar === normCrop || normVar === "other" || normVar === "not specified" || normVar === "other / not specified") {
    return "Other / Not specified";
  }
  return varietyName.trim();
}

/**
 * Verified official agricultural crop & variety catalog (data.gov.in / ICAR aligned).
 */
export const OFFICIAL_CROP_CATALOG: Record<string, string[]> = {
  Potato: ["Kufri Jyoti", "Kufri Pukhraj", "Kufri Chandramukhi", "Kufri Bahar", "Kufri Lauvkar", "Other / Not specified"],
  Rice: ["Basmati", "Pusa Basmati", "IR 64", "Sona Masoori", "Gobindobhog", "Other / Not specified"],
  Tomato: ["Vaishali", "Abhinav", "Pusa Ruby", "Arka Rakshak", "Himsona", "Other / Not specified"],
  Onion: ["Nashik Red", "Bhima Super", "Pusa Red", "Agrifound Dark Red", "Other / Not specified"],
  Wheat: ["Sharbati", "Lokwan", "PBW 343", "Kalyan Sona", "Other / Not specified"],
  Maize: ["African Tall", "Ganga 5", "Deccan 103", "Other / Not specified"],
  Groundnut: ["Kadiri 6", "TAG 24", "TMV 2", "Other / Not specified"],
  Cotton: ["BT Cotton", "MCU 5", "Suvin", "Other / Not specified"],
  Soybean: ["JS 335", "JS 9560", "NRC 37", "Other / Not specified"],
  Chilli: ["Guntur Sannam", "Byadgi", "Bhut Jolokia", "Other / Not specified"],
};

export const sampleCrops: Crop[] = [
  {
    id: 101,
    crop: "Onion",
    variety: "Nashik Red",
    category: "Vegetables",
    farmer: "Ramesh Patil",
    location: "Nashik, Maharashtra",
    quantity: 840,
    unit: "kg",
    price: 26,
    harvestDate: "2025-04-08",
    grade: "A",
    organic: false,
    image: "",
    status: "active",
  },
  {
    id: 102,
    crop: "Turmeric",
    variety: "Salem Erode",
    category: "Spices",
    farmer: "Savita FPO",
    location: "Erode, Tamil Nadu",
    quantity: 260,
    unit: "kg",
    price: 148,
    harvestDate: "2025-04-02",
    grade: "A",
    organic: true,
    image: "",
    status: "active",
  },
  {
    id: 103,
    crop: "Tomato",
    variety: "Hybrid 909",
    category: "Vegetables",
    farmer: "Meena Kulkarni",
    location: "Pune, Maharashtra",
    quantity: 420,
    unit: "kg",
    price: 34,
    harvestDate: "2025-04-12",
    grade: "A",
    organic: false,
    image: "",
    status: "active",
  },
  {
    id: 104,
    crop: "Pomegranate",
    variety: "Bhagwa",
    category: "Fruits",
    farmer: "Kisan Pragati FPO",
    location: "Solapur, Maharashtra",
    quantity: 1200,
    unit: "kg",
    price: 118,
    harvestDate: "2025-04-15",
    grade: "Premium",
    organic: true,
    image: "",
    status: "active",
  },
];

const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
const date = (value: string) =>
  new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
const statusTone = (status: string) =>
  status === "DELIVERED"
    ? "green"
    : status === "OUT_FOR_DELIVERY"
      ? "gold"
      : status === "CANCELLED" || status === "REJECTED"
        ? "red"
        : status === "ACCEPTED" || status === "PROCESSING"
          ? "orange"
          : "neutral";

function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card)/.7)] p-10 text-center">
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-[hsl(var(--muted))] text-[hsl(var(--primary))]">
        <Sprout size={23} />
      </div>
      <h3 className="font-display text-xl font-bold">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-[hsl(var(--muted-foreground))]">
        {detail}
      </p>
      {action}
    </div>
  );
}

function AuthFrame({
  eyebrow,
  title,
  detail,
  children,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] bg-[hsl(var(--background))] px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <Logo />
          <Link
            href="/"
            className="text-sm font-semibold text-[hsl(var(--muted-foreground))]"
          >
            Back to home
          </Link>
        </div>
        <div className="mx-auto grid max-w-4xl gap-10 py-14 md:grid-cols-[.8fr_1.2fr] md:items-center md:py-20">
          <div>
            <div className="font-mono-ui text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--primary))]">
              {eyebrow}
            </div>
            <h1 className="mt-3 font-display text-5xl font-bold leading-[.95] tracking-[-.055em]">
              {title}
            </h1>
            <p className="mt-5 max-w-sm text-sm leading-6 text-[hsl(var(--muted-foreground))]">
              {detail}
            </p>
            <div className="mt-8 rounded-2xl bg-[hsl(var(--primary))] p-5 text-white">
              <Leaf size={20} className="text-[hsl(var(--accent))]" />
              <p className="mt-6 font-display text-xl font-bold leading-tight">
                Direct from farm.
                <br />
                Fair for farmers.
              </p>
              <p className="mt-3 text-xs leading-5 text-white/60">
                A simpler path from the people who grow food to the people who
                need it.
              </p>
            </div>
          </div>
          <div className="rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-[0_14px_32px_hsl(158_28%_16%/.07)] sm:p-8">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}export function Register({ onRole }: { onRole: (role: AppRole) => void }) {
  const [, setLocation] = useLocation();
  const auth = useAuth();

  // Read initial role from URL query param (?role=farmer|buyer|consumer|driver)
  const initialRole: AppRole = (() => {
    if (typeof window !== "undefined") {
      const param = new URLSearchParams(window.location.search).get("role")?.toLowerCase();
      if (param === "farmer" || param === "buyer" || param === "consumer" || param === "driver") {
        return param as AppRole;
      }
    }
    return "farmer";
  })();

  const [role, setRegisterRole] = useState<AppRole>(initialRole);
  const [otpMethod, setOtpMethod] = useState<"EMAIL" | "SMS">("EMAIL");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mobile, setMobile] = useState("");
  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");
  const [organizationName, setOrganizationName] = useState("");

  // Role-specific fields
  // Farmer
  const [farmingExperience, setFarmingExperience] = useState("3-5");
  const [farmSize, setFarmSize] = useState("");
  const [farmSizeUnit, setFarmSizeUnit] = useState("acres");
  const [farmingType, setFarmingType] = useState("Organic");
  const [cropsGrown, setCropsGrown] = useState("");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState("");

  // Bulk Buyer
  const [buyerType, setBuyerType] = useState("Wholesaler");
  const [purchasingInterests, setPurchasingInterests] = useState("5 - 20 Quintals / week");
  const [preferredCrops, setPreferredCrops] = useState("");

  // Consumer
  const [deliveryAddress, setDeliveryAddress] = useState("");

  // Driver
  const [vehicleType, setVehicleType] = useState("Mini Truck (Tata Ace)");
  const [serviceArea, setServiceArea] = useState("");

  const [feedback, setFeedback] = useState("");
  const [feedbackKind, setFeedbackKind] = useState<"success" | "error">("error");
  const [confirmationRequired, setConfirmationRequired] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationMobile, setVerificationMobile] = useState("");
  const [verificationMethod, setVerificationMethod] = useState<"EMAIL" | "SMS">("EMAIL");
  const [otp, setOtp] = useState("");
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [pending, setPending] = useState(false);

  const location = district && state ? `${district}, ${state}` : "";

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = window.setTimeout(() => {
      setCooldownSeconds((seconds) => Math.max(seconds - 1, 0));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [cooldownSeconds]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending || cooldownSeconds > 0) return;
    setPending(true);
    setFeedback("");
    setFeedbackKind("error");

    const extraMetadata = {
      farming_experience: role === "farmer" && farmingExperience ? `${farmingExperience} years` : undefined,
      farm_size: role === "farmer" && farmSize ? Number(farmSize) : undefined,
      farm_size_unit: role === "farmer" ? farmSizeUnit : undefined,
      farming_type: role === "farmer" ? farmingType : undefined,
      crops_grown: role === "farmer" ? cropsGrown : undefined,
      profile_photo_url: role === "farmer" && profilePhotoUrl ? profilePhotoUrl : undefined,
      buyer_type: role === "buyer" ? buyerType : undefined,
      purchasing_interests: role === "buyer" ? purchasingInterests : undefined,
      preferred_crops: role === "buyer" ? preferredCrops : undefined,
      delivery_address: role === "consumer" ? deliveryAddress : undefined,
      vehicle_type: role === "driver" ? vehicleType : undefined,
      service_area: role === "driver" ? serviceArea : undefined,
    };

    try {
      localStorage.setItem("f2f_pending_profile", JSON.stringify(extraMetadata));
    } catch {
      // safe storage fallback
    }

    try {
      const result = await auth.signUp({
        name,
        email,
        password,
        mobile,
        otp_method: otpMethod,
        location,
        role: role === "farmer" ? "FARMER" : role === "consumer" ? "CONSUMER" : role === "driver" ? "DRIVER" : "BUYER",
        ...(role === "farmer"
          ? {}
          : role === "consumer"
            ? { business_name: deliveryAddress || "Consumer Household" }
            : role === "driver"
              ? { business_name: `${vehicleType} · ${serviceArea || district}` }
              : { business_name: organizationName }),
      });

      if (result.needsEmailConfirmation) {
        setConfirmationRequired(true);
        setVerificationEmail(email.trim().toLowerCase());
        setVerificationMobile(mobile);
        setVerificationMethod(result.otpMethod);
        setFeedbackKind("success");
        setCooldownSeconds(result.resendAvailableIn);
        setFeedback(result.otpMethod === "SMS" ? "Enter the six-digit code sent to your mobile number." : "Check your email for your six-digit verification code.");
      } else {
        try {
          await profilesApi.update(extraMetadata);
          localStorage.removeItem("f2f_pending_profile");
        } catch {
          // best-effort update
        }
        onRole(role);
        setLocation(role === "farmer" ? "/farmer/dashboard" : role === "driver" ? "/driver" : "/buyer");
      }
    } catch (submitError) {
      setFeedback(
        submitError instanceof Error
          ? submitError.message
          : "Registration failed. Please try again.",
      );
    } finally {
      setPending(false);
    }
  };

  const verifyOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending || otp.length !== 6) return;
    setPending(true);
    setFeedback("");
    try {
      if (verificationMethod === "SMS") await auth.verifyRegistrationOtp(verificationMobile, otp);
      else await auth.verifyEmail(verificationEmail, otp);

      try {
        const rawPending = localStorage.getItem("f2f_pending_profile");
        if (rawPending) {
          const parsed = JSON.parse(rawPending);
          await profilesApi.update(parsed);
          localStorage.removeItem("f2f_pending_profile");
        }
      } catch {
        // best effort
      }

      setFeedbackKind("success");
      setFeedback("Account verified! You can now sign in.");
      window.setTimeout(() => setLocation("/login"), 900);
    } catch (verifyError) {
      setFeedbackKind("error");
      setFeedback(verifyError instanceof Error ? verifyError.message : "Verification failed. Please try again.");
    } finally {
      setPending(false);
    }
  };

  const resendOtp = async () => {
    if (pending || cooldownSeconds > 0) return;
    setPending(true);
    setFeedback("");
    try {
      const result = await auth.resendEmailOtp(verificationEmail);
      setCooldownSeconds(result.resendAvailableIn);
      setFeedbackKind("success");
      setFeedback("A new verification code has been sent.");
    } catch (resendError) {
      setFeedbackKind("error");
      setFeedback(resendError instanceof Error ? resendError.message : "Could not resend the code.");
    } finally {
      setPending(false);
    }
  };

  if (confirmationRequired) {
    return (
      <AuthFrame eyebrow="Verification" title="One last step." detail="Enter the six-digit code we sent to finish creating your Farm2Fork account.">
        <form onSubmit={verifyOtp} className="space-y-5">
          <Field label="Verification code" value={otp} onChange={(value) => setOtp(value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit code" test="email-verification-otp" autoComplete="one-time-code" inputMode="numeric" />
          {feedback && <Feedback message={feedback} kind={feedbackKind} />}
          {cooldownSeconds > 0 ? (
            <p className="text-center text-xs text-[hsl(var(--muted-foreground))]">You can request another code in {cooldownSeconds}s.</p>
          ) : (
            <button type="button" onClick={() => void resendOtp()} disabled={pending} className="w-full text-sm font-bold text-[hsl(var(--primary))] disabled:opacity-50">Resend verification code</button>
          )}
          <button type="submit" disabled={pending || otp.length !== 6} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {pending ? "Verifying…" : "Verify code"} <ChevronDown size={16} className="-rotate-90" />
          </button>
          <p className="text-center text-xs text-[hsl(var(--muted-foreground))]">Already verified? <Link href="/login" className="font-bold text-[hsl(var(--primary))]">Sign in</Link></p>
        </form>
      </AuthFrame>
    );
  }

  const roleConfigs = [
    {
      id: "farmer" as AppRole,
      title: "Farmer",
      icon: "🌾",
      desc: "List crops, set prices, negotiate with buyers, and arrange transport",
    },
    {
      id: "buyer" as AppRole,
      title: "Bulk Buyer",
      icon: "🏪",
      desc: "Purchase directly from farmers, negotiate prices, and manage bulk orders",
    },
    {
      id: "consumer" as AppRole,
      title: "Consumer",
      icon: "🛒",
      desc: "Buy fresh farm produce directly with transparent pricing",
    },
    {
      id: "driver" as AppRole,
      title: "Driver",
      icon: "🚚",
      desc: "Accept transport requests, provide real-time updates, and earn per delivery",
    },
  ];

  return (
    <AuthFrame
      eyebrow="Join Farm2Fork"
      title="Create your account"
      detail="Direct connectivity between farmers, bulk buyers, consumers, and transport drivers."
    >
      <form onSubmit={submit} className="space-y-5">
        <div>
          <div className="text-sm font-bold text-[hsl(var(--foreground))]">I am registering as:</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {roleConfigs.map((item) => {
              const isSelected = role === item.id;
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setRegisterRole(item.id)}
                  className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all ${
                    isSelected
                      ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/.08)] ring-1 ring-[hsl(var(--primary))]"
                      : "border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:border-[hsl(var(--muted-foreground)/.3)]"
                  }`}
                  data-testid={`register-role-${item.id}`}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="text-lg">{item.icon}</span>
                    {isSelected && <CheckCircle2 size={15} className="text-[hsl(var(--primary))]" />}
                  </div>
                  <div className="mt-1 font-bold text-sm text-[hsl(var(--foreground))]">{item.title}</div>
                  <div className="mt-0.5 text-[11px] leading-tight text-[hsl(var(--muted-foreground))]">{item.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Primary Contact Details */}
        <Field
          label={role === "buyer" ? "Contact Person Name" : "Full Name"}
          value={name}
          onChange={setName}
          placeholder={role === "buyer" ? "e.g. Rajesh Singhal" : "e.g. Ramesh Kumar"}
          test="register-name"
          autoComplete="name"
        />

        <div>
          <div className="text-sm font-bold">Receive OTP via</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["EMAIL", "SMS"] as const).map((method) => (
              <button
                type="button"
                key={method}
                onClick={() => setOtpMethod(method)}
                className={`min-h-11 rounded-xl border text-sm font-bold ${otpMethod === method ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/.08)] text-[hsl(var(--primary))]" : "border-[hsl(var(--border))]"}`}
              >
                {method === "SMS" ? "Mobile OTP" : "Email OTP"}
              </button>
            ))}
          </div>
        </div>

        <Field
          label="Email address"
          value={email}
          onChange={setEmail}
          placeholder={otpMethod === "SMS" ? "Optional for mobile OTP" : "you@example.com"}
          type="email"
          test="register-email"
          autoComplete="email"
        />

        <Field
          label="Password"
          value={password}
          onChange={setPassword}
          placeholder="At least 8 characters"
          type="password"
          test="register-password"
          autoComplete="new-password"
        />

        <Field
          label="Mobile number"
          value={mobile}
          onChange={setMobile}
          placeholder="10-digit mobile number"
          type="tel"
          test="register-mobile"
          autoComplete="tel"
        />

        {/* State -> District Cascading Dropdowns (36 States/UTs, No manual typing) */}
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.3)] p-3">
          <StateDistrictSelector
            selectedState={state}
            selectedDistrict={district}
            onStateChange={(s) => setState(s)}
            onDistrictChange={(d) => setDistrict(d)}
            stateLabel="State / Union Territory"
            districtLabel="District / City"
            required
            stateTestId="register-state"
            districtTestId="register-district"
          />
        </div>

        {/* Role-Specific Form Fields */}

        {/* 1. FARMER: Experience, Farm Size, Farming Type, Crops Grown, Profile Photo. NO FARM NAME! */}
        {role === "farmer" && (
          <div className="space-y-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.2)] p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--primary))]">
              Farmer Agricultural Details
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-[hsl(var(--foreground))]">
                  Farming Experience
                </label>
                <select
                  value={farmingExperience}
                  onChange={(e) => setFarmingExperience(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
                  data-testid="farmer-experience"
                >
                  <option value="1-2">1 - 2 years</option>
                  <option value="3-5">3 - 5 years</option>
                  <option value="6-10">6 - 10 years</option>
                  <option value="10+">10+ years</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[hsl(var(--foreground))]">
                  Farming Type
                </label>
                <select
                  value={farmingType}
                  onChange={(e) => setFarmingType(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
                  data-testid="farmer-farming-type"
                >
                  <option value="Organic">Organic</option>
                  <option value="Conventional">Conventional</option>
                  <option value="Natural">Natural</option>
                  <option value="Mixed">Mixed</option>
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
              <div>
                <label className="block text-xs font-bold text-[hsl(var(--foreground))]">
                  Farm Size
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={farmSize}
                  onChange={(e) => setFarmSize(e.target.value)}
                  placeholder="e.g. 5"
                  className="mt-1.5 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
                  data-testid="farmer-farm-size"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[hsl(var(--foreground))]">
                  Unit
                </label>
                <select
                  value={farmSizeUnit}
                  onChange={(e) => setFarmSizeUnit(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
                  data-testid="farmer-size-unit"
                >
                  <option value="acres">Acres</option>
                  <option value="hectares">Hectares</option>
                  <option value="bighas">Bighas</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[hsl(var(--foreground))]">
                Crops Grown
              </label>
              <input
                type="text"
                value={cropsGrown}
                onChange={(e) => setCropsGrown(e.target.value)}
                placeholder="e.g. Wheat, Rice, Tomato, Onion, Potato"
                className="mt-1.5 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
                data-testid="farmer-crops-grown"
              />
              <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">
                Separate multiple crops with commas.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-[hsl(var(--foreground))]">
                Profile Photo (URL or optional)
              </label>
              <input
                type="url"
                value={profilePhotoUrl}
                onChange={(e) => setProfilePhotoUrl(e.target.value)}
                placeholder="https://... (or leave empty)"
                className="mt-1.5 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
                data-testid="farmer-photo-url"
              />
            </div>
          </div>
        )}

        {/* 2. BULK BUYER: Business Name, Buyer Type, Volume, Preferred Crops */}
        {role === "buyer" && (
          <div className="space-y-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.2)] p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Bulk Buyer Commercial Details
            </div>
            <Field
              label="Business / Company / Firm Name"
              value={organizationName}
              onChange={setOrganizationName}
              placeholder="e.g. APMC Mandi Traders & Co."
              test="register-business-name"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-[hsl(var(--foreground))]">
                  Buyer Type
                </label>
                <select
                  value={buyerType}
                  onChange={(e) => setBuyerType(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
                  data-testid="buyer-type"
                >
                  <option value="Retailer">Retailer</option>
                  <option value="Wholesaler">Wholesaler</option>
                  <option value="Restaurant / Hotel">Restaurant / Hotel</option>
                  <option value="Food Processor">Food Processor</option>
                  <option value="Exporter">Exporter</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[hsl(var(--foreground))]">
                  Purchasing Volume Requirements
                </label>
                <select
                  value={purchasingInterests}
                  onChange={(e) => setPurchasingInterests(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
                  data-testid="buyer-purchasing-interests"
                >
                  <option value="1 - 5 Quintals / week">1 - 5 Quintals / week</option>
                  <option value="5 - 20 Quintals / week">5 - 20 Quintals / week</option>
                  <option value="Full truckload (10+ Tonnes)">Full truckload (10+ Tonnes)</option>
                  <option value="Daily fresh kitchen procurement">Daily fresh kitchen procurement</option>
                  <option value="Seasonal harvest procurement">Seasonal harvest procurement</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-[hsl(var(--foreground))]">
                Preferred Crops
              </label>
              <input
                type="text"
                value={preferredCrops}
                onChange={(e) => setPreferredCrops(e.target.value)}
                placeholder="e.g. Onion, Potato, Tomato, Grains"
                className="mt-1.5 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
                data-testid="buyer-preferred-crops"
              />
            </div>
          </div>
        )}

        {/* 3. CONSUMER: Delivery Address */}
        {role === "consumer" && (
          <div className="space-y-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.2)] p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
              Consumer Delivery Address
            </div>
            <div>
              <label className="block text-xs font-bold text-[hsl(var(--foreground))]">
                Delivery Address
              </label>
              <textarea
                rows={3}
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="House/flat number, apartment/colony name, landmark..."
                className="mt-1.5 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
                data-testid="consumer-delivery-address"
              />
              <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">
                Used to deliver fresh farm-harvested produce right to your door.
              </p>
            </div>
          </div>
        )}

        {/* 4. DRIVER: Vehicle Type, Service Area / Operating Route */}
        {role === "driver" && (
          <div className="space-y-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.2)] p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-orange-700 dark:text-orange-400">
              Logistics & Vehicle Information
            </div>
            <div>
              <label className="block text-xs font-bold text-[hsl(var(--foreground))]">
                Vehicle Type
              </label>
              <select
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
                data-testid="driver-vehicle-type"
              >
                <option value="Mini Truck (Tata Ace)">Mini Truck (Tata Ace)</option>
                <option value="Pickup Truck">Pickup Truck</option>
                <option value="Medium Truck">Medium Truck</option>
                <option value="Large Commercial Truck">Large Commercial Truck</option>
                <option value="Refrigerated Van">Refrigerated Van</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[hsl(var(--foreground))]">
                Service Area / Operating Route
              </label>
              <input
                type="text"
                value={serviceArea}
                onChange={(e) => setServiceArea(e.target.value)}
                placeholder="e.g. Nashik - Mumbai highway corridor"
                className="mt-1.5 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
                data-testid="driver-service-area"
              />
            </div>
          </div>
        )}

        {feedback && <Feedback message={feedback} kind={feedbackKind} />}
        {cooldownSeconds > 0 && (
          <p className="text-center text-xs text-[hsl(var(--muted-foreground))]">
            You can request another verification email in {cooldownSeconds}s.
          </p>
        )}
        <button
          type="submit"
          disabled={
            pending ||
            cooldownSeconds > 0 ||
            !name ||
            (otpMethod === "EMAIL" && !email) ||
            password.length < 8 ||
            !mobile ||
            !state ||
            !district ||
            (role === "buyer" && !organizationName)
          }
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending
            ? "Creating account…"
            : cooldownSeconds > 0
              ? `Please wait ${cooldownSeconds}s`
              : confirmationRequired
                ? "Send confirmation again"
                : "Create my account"}{" "}
          <ChevronDown size={16} className="-rotate-90" />
        </button>
        <p className="text-center text-xs text-[hsl(var(--muted-foreground))]">
          Already have a profile?{" "}
          <Link href="/login" className="font-bold text-[hsl(var(--primary))]">
            Sign in
          </Link>
        </p>
      </form>
    </AuthFrame>
  );
}

export function Login({ onRole }: { onRole: (role: AppRole) => void }) {
  const [, setLocation] = useLocation();
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"PASSWORD" | "OTP">("PASSWORD");
  const [otpMethod, setOtpMethod] = useState<"EMAIL" | "SMS">("EMAIL");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setFeedback("");
    const trimmedEmail = email.trim();
    const trimmedOtp = otp.trim();
    try {
      const profile = authMode === "OTP"
        ? otpSent
          ? await auth.signInWithOtp(otpMethod, trimmedEmail, trimmedOtp)
          : (await auth.sendLoginOtp(otpMethod, trimmedEmail), setOtpSent(true), null)
        : await auth.signIn(trimmedEmail, password);
      if (!profile) { setFeedback(otpMethod === "SMS" ? "If this mobile is verified, an OTP has been sent." : "If this email is verified, an OTP has been sent."); return; }
      const role = profile.role.toLowerCase() as AppRole;
      onRole(role);
      setLocation(role === "farmer" ? "/farmer/dashboard" : role === "driver" ? "/driver" : role === "admin" ? "/admin" : "/buyer");
    } catch (loginError) {
      setFeedback(
        loginError instanceof Error
          ? loginError.message
          : "Sign in failed. Please check your details.",
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <AuthFrame
      eyebrow="Welcome back"
      title="Good to see you again."
      detail="Sign in with your password or a verified Email/Mobile OTP."
    >
      <form onSubmit={submit} className="space-y-5">
        <div className="grid grid-cols-2 gap-2">
          {(["PASSWORD", "OTP"] as const).map((mode) => <button key={mode} type="button" onClick={() => { setAuthMode(mode); setOtpSent(false); }} className={`min-h-11 rounded-xl border text-sm font-bold ${authMode === mode ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/.08)] text-[hsl(var(--primary))]" : "border-[hsl(var(--border))]"}`}>{mode === "PASSWORD" ? "Password" : "OTP"}</button>)}
        </div>
        {authMode === "OTP" && <div><div className="mb-2 text-sm font-bold">Receive OTP via</div><div className="grid grid-cols-2 gap-2">{(["EMAIL", "SMS"] as const).map((method) => <button key={method} type="button" onClick={() => { setOtpMethod(method); setOtpSent(false); }} className={`min-h-10 rounded-xl border text-sm font-semibold ${otpMethod === method ? "border-[hsl(var(--primary))] text-[hsl(var(--primary))]" : "border-[hsl(var(--border))]"}`}>{method === "SMS" ? "Mobile number" : "Email address"}</button>)}</div></div>}
        <Field
          label={authMode === "OTP" && otpMethod === "SMS" ? "Mobile number" : "Email address"}
          value={email}
          onChange={setEmail}
          placeholder={authMode === "OTP" && otpMethod === "SMS" ? "10-digit mobile number" : "you@example.com"}
          type={authMode === "OTP" && otpMethod === "SMS" ? "tel" : "email"}
          test="login-email"
          autoComplete="username"
        />
        {authMode === "PASSWORD" && <Field
          label="Password"
          value={password}
          onChange={setPassword}
          placeholder="Your password"
          type="password"
          test="login-password"
          autoComplete="current-password"
        />}
        {authMode === "OTP" && otpSent && <Field label="One-time password" value={otp} onChange={(value) => setOtp(value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit code" test="login-otp" inputMode="numeric" autoComplete="one-time-code" />}
        {feedback && <Feedback message={feedback} kind="error" />}
        <button
          type="submit"
          disabled={pending || !email || (authMode === "PASSWORD" ? !password : otpSent && otp.length !== 6)}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Working…" : authMode === "OTP" && !otpSent ? "Send OTP" : "Continue"}{" "}
          <ChevronDown size={16} className="-rotate-90" />
        </button>
        <div className="flex justify-between text-xs">
          <Link
            href="/forgot-password"
            className="font-bold text-[hsl(var(--primary))]"
          >
            Forgot your password?
          </Link>
          <Link
            href="/register"
            className="font-bold text-[hsl(var(--primary))]"
          >
            Create a profile
          </Link>
        </div>
        <div className="border-t border-[hsl(var(--border))] pt-3 text-center text-xs text-[hsl(var(--muted-foreground))]">
          <span>Restricted operational access: </span>
          <Link
            href="/admin-login"
            className="font-semibold text-[hsl(var(--primary))] hover:underline"
            data-testid="link-admin-login"
          >
            Admin Portal
          </Link>
        </div>
      </form>
    </AuthFrame>
  );
}

export function AdminLogin({ onRole }: { onRole: (role: AppRole) => void }) {
  const auth = useAuth();
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setPending(true); setFeedback("");
    try { const profile = await auth.signInAdmin(username, password); onRole(profile.role.toLowerCase() as AppRole); setLocation("/admin"); }
    catch (error) { setFeedback(error instanceof Error ? error.message : "Administrator sign-in failed."); }
    finally { setPending(false); }
  };
  return <AuthFrame eyebrow="Restricted access" title="Administrator sign in" detail="Use the configured server-side administrator credentials."><form onSubmit={submit} className="space-y-5"><Field label="Username" value={username} onChange={setUsername} placeholder="Administrator username" test="admin-login-username" autoComplete="username" /><Field label="Password" value={password} onChange={setPassword} placeholder="Administrator password" type="password" test="admin-login-password" autoComplete="current-password" />{feedback && <Feedback message={feedback} kind="error" />}<button type="submit" disabled={pending || !username || !password} className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-bold text-white disabled:opacity-50">{pending ? "Signing in..." : "Sign in as Admin"}</button><p className="text-center text-xs text-[hsl(var(--muted-foreground))]"><Link href="/login" className="font-bold text-[hsl(var(--primary))]">Back to standard login</Link></p></form></AuthFrame>;
}

export function ForgotPassword() {
  const auth = useAuth();
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await auth.resetPassword(email);
      setSent(true);
      setFeedback(
        "If an account exists for that email, recovery instructions are on the way.",
      );
    } catch (resetError) {
      setFeedback(
        resetError instanceof Error
          ? resetError.message
          : "Could not send recovery instructions.",
      );
    }
  };
  return (
    <AuthFrame
      eyebrow="Need a hand?"
      title="We’ll help you get back in."
        detail="Password recovery is not available yet. Please contact Farm2Fork support."
    >
      <form onSubmit={submit} className="space-y-5">
        <Field
          label="Email address"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          type="email"
          test="forgot-email"
        />
        {feedback && (
          <Feedback message={feedback} kind={sent ? "success" : "error"} />
        )}
        <button
          type="submit"
          disabled={!email}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
        {sent ? "Instructions sent" : "Contact support"}
        </button>
        <p className="text-center text-xs text-[hsl(var(--muted-foreground))]">
          Remembered your details?{" "}
          <Link href="/login" className="font-bold text-[hsl(var(--primary))]">
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthFrame>
  );
}

export function ResetPassword() {
  const [, setLocation] = useLocation();
  const auth = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 6 || password !== confirmation) return;
    setPending(true);
    setFeedback("");
    try {
      await auth.updatePassword(password);
      setFeedback(
        "Your password has been updated. You can sign in with it now.",
      );
      setTimeout(() => setLocation("/login"), 900);
    } catch (resetError) {
      setFeedback(
        resetError instanceof Error
          ? resetError.message
          : "Could not update your password.",
      );
    } finally {
      setPending(false);
    }
  };
  const mismatch = Boolean(confirmation) && password !== confirmation;
  return (
    <AuthFrame
      eyebrow="Secure recovery"
      title="Choose a new password."
      detail="Set a new password for your Farm2Fork account."
    >
      <form onSubmit={submit} className="space-y-5">
        <input
          type="email"
          value={auth.session?.user.email ?? ""}
          readOnly
          aria-hidden="true"
          tabIndex={-1}
          autoComplete="username"
          className="sr-only"
        />
        <Field
          label="New password"
          value={password}
          onChange={setPassword}
          placeholder="At least 6 characters"
          type="password"
          test="reset-password"
          autoComplete="new-password"
        />
        <Field
          label="Confirm new password"
          value={confirmation}
          onChange={setConfirmation}
          placeholder="Type it again"
          type="password"
          test="reset-password-confirmation"
          autoComplete="new-password"
        />
        {mismatch && (
          <Feedback message="The passwords do not match." kind="error" />
        )}
        {feedback && <Feedback message={feedback} kind="success" />}
        <button
          type="submit"
          disabled={pending || password.length < 6 || mismatch}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Updating…" : "Update password"}
        </button>
        <p className="text-center text-xs text-[hsl(var(--muted-foreground))]">
          Need a new link?{" "}
          <Link
            href="/forgot-password"
            className="font-bold text-[hsl(var(--primary))]"
          >
            Start recovery again
          </Link>
        </p>
      </form>
    </AuthFrame>
  );
}

export function Home({
  role,
  onRole,
}: {
  role: AppRole;
  onRole: (role: AppRole) => void;
}) {
  const [checking, setChecking] = useState(false);
  const { isHindi, toggleLanguage } = useLanguage();
  const health = useHealthCheck();

  return (
    <div className="min-h-[100dvh] overflow-hidden bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      {/* 1. TOP HEADER */}
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
        <Logo />

        <div className="flex items-center gap-4 sm:gap-6">
          {/* Nav Links: Only Home and How it works (no obsolete items) */}
          <nav className="hidden sm:flex items-center gap-6 text-sm">
            <Link
              href="/"
              className="font-semibold text-[#163625] border-b-2 border-emerald-600 pb-0.5"
              data-testid="link-nav-home"
            >
              Home
            </Link>
            <a
              href="#how-it-works"
              data-testid="link-how-it-works"
              className="font-medium text-stone-600 hover:text-stone-900 transition-colors"
            >
              How it works
            </a>
          </nav>

          {/* 23 Indian Languages Selector */}
          <LanguageSelector variant="header" />

          {/* Segmented Role Switcher: Farmer, Bulk Buyer, Consumer, Driver */}
          <div className="hidden lg:flex items-center rounded-full bg-[#f0f2ef] p-1 text-xs">
            {[
              { id: "farmer" as const, label: "Farmer" },
              { id: "buyer" as const, label: "Bulk Buyer" },
              { id: "consumer" as const, label: "Consumer" },
              { id: "driver" as const, label: "Driver" },
            ].map((item) => {
              const isCurrent = role === item.id;
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => onRole(item.id)}
                  className={`rounded-full px-3.5 py-1 font-medium transition-all ${
                    isCurrent
                      ? "bg-white text-[#155337] font-bold shadow-xs"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                  data-testid={`role-tab-${item.id}`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Separate Login and Sign Up controls */}
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-lg border border-stone-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-[#163625] shadow-2xs hover:bg-stone-50 transition-colors"
              data-testid="link-login"
            >
              Login
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-lg bg-[#155337] px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-[#11422c] transition-colors"
              data-testid="link-signup"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </header>

      {/* 2. HERO SECTION */}
      <section className="mx-auto max-w-7xl px-5 pt-8 pb-12 sm:px-8 md:pt-12 md:pb-16">
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_1.15fr]">
          {/* Left Column: Headline, Copy, CTAs, 3-Col Features */}
          <div>
            <h1 className="font-display text-4xl font-bold tracking-tight text-[#163625] sm:text-5xl lg:text-[54px] lg:leading-[1.08]">
              Direct from farms.<br />
              Better connected.
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-[#4a6356]">
              Farm2Fork connects farmers and FPOs with bulk buyers, consumers and transport drivers through market information, location-aware matching and coordinated fulfilment.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3.5">
              <Link
                href={role === "farmer" ? "/farmer/sell" : "/marketplace"}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#155337] px-6 text-sm font-semibold text-white shadow-xs hover:bg-[#11422c] transition-colors"
                data-testid="link-explore-marketplace"
              >
                Explore Marketplace <ArrowRight size={16} />
              </Link>
              <Link
                href="/insights"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#cbd8d0] bg-white px-6 text-sm font-semibold text-[#155337] hover:bg-stone-50 transition-colors shadow-2xs"
                data-testid="link-mandi-intelligence"
              >
                Mandi Price Intelligence
              </Link>
            </div>

            {/* 3 Value Points with Dividers */}
            <div className="mt-10 grid grid-cols-3 gap-6 border-t border-[#e2eae5] pt-6">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-[#155337]">
                  <Leaf size={18} />
                </div>
                <div>
                  <div className="font-display text-sm font-bold text-[#163625]">Direct Trade</div>
                  <div className="mt-0.5 text-xs text-[#587265]">Farmer sets price & lot</div>
                </div>
              </div>

              <div className="flex items-start gap-3 border-l border-[#e2eae5] pl-6">
                <div className="mt-0.5 text-[#155337]">
                  <Landmark size={18} />
                </div>
                <div>
                  <div className="font-display text-sm font-bold text-[#163625]">Mandi Price Intelligence</div>
                  <div className="mt-0.5 text-xs text-[#587265]">Official mandi reference</div>
                </div>
              </div>

              <div className="flex items-start gap-3 border-l border-[#e2eae5] pl-6">
                <div className="mt-0.5 text-[#155337]">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <div className="font-display text-sm font-bold text-[#163625]">Secure Handover</div>
                  <div className="mt-0.5 text-xs text-[#587265]">Verified driver dispatch</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Exact Hero Artwork with Overlay & Moving Truck Animation */}
          <div className="relative w-full overflow-hidden rounded-[2.5rem] border border-[#d6e2d9] bg-[#eef3ed] shadow-lg">
            <img
              src="/images/hero_food_journey.jpg"
              alt="Farm2Fork Direct Agricultural Supply Chain"
              className="h-full w-full object-cover block"
            />

            {/* Farmer Tag */}
            <div className="absolute left-[13%] top-[27%] -translate-x-1/2 -translate-y-1/2 z-10 inline-flex items-center gap-1.5 rounded-full bg-[#155337] px-3.5 py-1.5 text-xs font-bold text-white shadow-md">
              <MapPin size={13} className="text-emerald-300" />
              Farmer
            </div>

            {/* Bulk Buyer Tag */}
            <div className="absolute right-[13%] top-[29%] translate-x-1/2 -translate-y-1/2 z-10 inline-flex items-center gap-1.5 rounded-full bg-[#155337] px-3.5 py-1.5 text-xs font-bold text-white shadow-md">
              <MapPin size={13} className="text-emerald-300" />
              Bulk Buyer
            </div>

            {/* Dashed Connecting Transit Arc with Animated Truck Motion */}
            <svg
              className="pointer-events-none absolute inset-0 z-10 h-full w-full"
              viewBox="0 0 700 400"
              preserveAspectRatio="none"
            >
              <defs>
                <path
                  id="heroTransitCurve"
                  d="M 125 125 Q 350 25 575 135"
                  fill="none"
                />
              </defs>
              <path
                d="M 125 125 Q 350 25 575 135"
                stroke="#155337"
                strokeWidth="2.5"
                strokeDasharray="6 6"
                fill="none"
                opacity="0.85"
              />
              <g>
                <circle r="17" fill="#155337" filter="drop-shadow(0 2px 5px rgba(0,0,0,0.35))" />
                <path
                  d="M -7 -4 h 9 v 8 h -9 z M 2 -1 h 4 l 2 3 v 2 h -6 z M -5 5 a 1.5 1.5 0 1 0 0 -3 a 1.5 1.5 0 0 0 0 3 z M 5 5 a 1.5 1.5 0 1 0 0 -3 a 1.5 1.5 0 0 0 0 3 z"
                  fill="#ffffff"
                />
                <animateMotion
                  dur="8s"
                  repeatCount="indefinite"
                  rotate="auto"
                >
                  <mpath href="#heroTransitCurve" />
                </animateMotion>
              </g>
            </svg>
          </div>
        </div>
      </section>

      {/* 3. VALUE PROPOSITION STRIP */}
      <div className="border-t border-[#e2eae5] bg-[#fafbf9] py-8">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <div className="flex items-center gap-3.5">
              <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-100/70 text-[#175239]">
                <Sprout size={20} />
              </div>
              <div>
                <div className="font-display text-sm font-bold text-[#163625]">Fresh Produce</div>
                <div className="text-xs text-[#587265]">Direct from farms</div>
              </div>
            </div>

            <div className="flex items-center gap-3.5 sm:border-l sm:border-[#e2eae5] sm:pl-6">
              <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-100/70 text-[#175239]">
                <ShieldCheck size={20} />
              </div>
              <div>
                <div className="font-display text-sm font-bold text-[#163625]">Verified Users</div>
                <div className="text-xs text-[#587265]">Trusted & safe</div>
              </div>
            </div>

            <div className="flex items-center gap-3.5 sm:border-l sm:border-[#e2eae5] sm:pl-6">
              <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-100/70 text-[#175239]">
                <Truck size={20} />
              </div>
              <div>
                <div className="font-display text-sm font-bold text-[#163625]">Faster Delivery</div>
                <div className="text-xs text-[#587265]">From farm to market</div>
              </div>
            </div>

            <div className="flex items-center gap-3.5 sm:border-l sm:border-[#e2eae5] sm:pl-6">
              <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-100/70 text-[#175239]">
                <TrendingUp size={20} />
              </div>
              <div>
                <div className="font-display text-sm font-bold text-[#163625]">Mandi Benchmarking</div>
                <div className="text-xs text-[#587265]">Official market rates</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. HOMEPAGE ROLE ENTRY (FARMER, BULK BUYER, CONSUMER, DRIVER) */}
      <section className="border-t border-[#e2eae5] bg-[#fbfdfa] px-5 py-14 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-xl">
            <div className="font-mono-ui text-[10px] font-bold uppercase tracking-[.18em] text-[#155337]">
              Four Connected Roles
            </div>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#163625] sm:text-4xl">
              Choose your role on Farm2Fork
            </h2>
            <p className="mt-2 text-sm text-[#587265]">
              Coordinated agricultural platform connecting growers, commercial buyers, household consumers, and logistics drivers.
            </p>
          </div>

          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {/* FARMER */}
            <div className="flex flex-col justify-between rounded-2xl border border-[#dce6e0] bg-white p-6 shadow-xs hover:border-[#155337]/40 transition-colors">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-100 text-[#155337]">
                    <Sprout size={22} />
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                    Producer
                  </span>
                </div>
                <h3 className="mt-4 font-display text-lg font-bold text-[#163625]">Farmer</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-[#587265]">
                  Sell crops directly and manage your farm listings.
                </p>
              </div>
              <div className="mt-6 flex items-center gap-2 pt-4 border-t border-stone-100">
                <Link
                  href="/login"
                  className="flex-1 text-center rounded-lg border border-stone-300 bg-white py-2 text-xs font-semibold text-[#163625] hover:bg-stone-50 transition-colors shadow-2xs"
                  data-testid="button-role-farmer-login"
                >
                  Login
                </Link>
                <Link
                  href="/register?role=farmer"
                  className="flex-1 text-center rounded-lg bg-[#155337] py-2 text-xs font-semibold text-white hover:bg-[#11422c] transition-colors shadow-2xs"
                  data-testid="button-role-farmer-signup"
                >
                  Sign Up
                </Link>
              </div>
            </div>

            {/* BULK BUYER */}
            <div className="flex flex-col justify-between rounded-2xl border border-[#dce6e0] bg-white p-6 shadow-xs hover:border-[#155337]/40 transition-colors">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                    <Store size={22} />
                  </div>
                  <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
                    Wholesale
                  </span>
                </div>
                <h3 className="mt-4 font-display text-lg font-bold text-[#163625]">Bulk Buyer</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-[#587265]">
                  Source produce in larger quantities from farmers.
                </p>
              </div>
              <div className="mt-6 flex items-center gap-2 pt-4 border-t border-stone-100">
                <Link
                  href="/login"
                  className="flex-1 text-center rounded-lg border border-stone-300 bg-white py-2 text-xs font-semibold text-[#163625] hover:bg-stone-50 transition-colors shadow-2xs"
                  data-testid="button-role-buyer-login"
                >
                  Login
                </Link>
                <Link
                  href="/register?role=buyer"
                  className="flex-1 text-center rounded-lg bg-[#155337] py-2 text-xs font-semibold text-white hover:bg-[#11422c] transition-colors shadow-2xs"
                  data-testid="button-role-buyer-signup"
                >
                  Sign Up
                </Link>
              </div>
            </div>

            {/* CONSUMER */}
            <div className="flex flex-col justify-between rounded-2xl border border-[#dce6e0] bg-white p-6 shadow-xs hover:border-[#155337]/40 transition-colors">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-blue-100 text-blue-800">
                    <Users size={22} />
                  </div>
                  <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-800">
                    Household
                  </span>
                </div>
                <h3 className="mt-4 font-display text-lg font-bold text-[#163625]">Consumer</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-[#587265]">
                  Buy fresh produce for your household.
                </p>
              </div>
              <div className="mt-6 flex items-center gap-2 pt-4 border-t border-stone-100">
                <Link
                  href="/login"
                  className="flex-1 text-center rounded-lg border border-stone-300 bg-white py-2 text-xs font-semibold text-[#163625] hover:bg-stone-50 transition-colors shadow-2xs"
                  data-testid="button-role-consumer-login"
                >
                  Login
                </Link>
                <Link
                  href="/register?role=consumer"
                  className="flex-1 text-center rounded-lg bg-[#155337] py-2 text-xs font-semibold text-white hover:bg-[#11422c] transition-colors shadow-2xs"
                  data-testid="button-role-consumer-signup"
                >
                  Sign Up
                </Link>
              </div>
            </div>

            {/* DRIVER */}
            <div className="flex flex-col justify-between rounded-2xl border border-[#dce6e0] bg-white p-6 shadow-xs hover:border-[#155337]/40 transition-colors">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-orange-100 text-orange-800">
                    <Truck size={22} />
                  </div>
                  <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-[10px] font-bold text-orange-800">
                    Logistics
                  </span>
                </div>
                <h3 className="mt-4 font-display text-lg font-bold text-[#163625]">Driver</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-[#587265]">
                  Pick up produce from farmers and deliver it to buyers and consumers.
                </p>
              </div>
              <div className="mt-6 flex items-center gap-2 pt-4 border-t border-stone-100">
                <Link
                  href="/login"
                  className="flex-1 text-center rounded-lg border border-stone-300 bg-white py-2 text-xs font-semibold text-[#163625] hover:bg-stone-50 transition-colors shadow-2xs"
                  data-testid="button-role-driver-login"
                >
                  Login
                </Link>
                <Link
                  href="/register?role=driver"
                  className="flex-1 text-center rounded-lg bg-[#155337] py-2 text-xs font-semibold text-white hover:bg-[#11422c] transition-colors shadow-2xs"
                  data-testid="button-role-driver-signup"
                >
                  Sign Up
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. HOW IT WORKS: 4 USER JOURNEYS */}
      <section
        id="how-it-works"
        className="border-t border-[hsl(var(--border))] bg-[hsl(var(--card)/.55)] px-5 py-20 sm:px-8"
      >
        <div className="mx-auto max-w-7xl">
          <div className="max-w-xl">
            <div className="font-mono-ui text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--primary))]">
              Four Connected Journeys
            </div>
            <h2 className="mt-2 font-display text-4xl font-bold tracking-[-.04em] sm:text-5xl">
              How Farm2Fork works
            </h2>
            <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">
              A direct link from farm to fork with end-to-end transparency for every participant.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Farmer Journey */}
            <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-xs">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🌾</span>
                <span className="font-display font-bold text-[hsl(var(--foreground))]">Farmer Journey</span>
              </div>
              <div className="mt-5 space-y-3.5">
                <div className="flex items-start gap-2.5 text-xs">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary)/.15)] font-mono text-[10px] font-bold text-[hsl(var(--primary))]">1</span>
                  <span><strong>List crops:</strong> Specify variety, harvest date & lot size</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary)/.15)] font-mono text-[10px] font-bold text-[hsl(var(--primary))]">2</span>
                  <span><strong>Set fair price:</strong> Compare with data.gov.in mandi rates</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary)/.15)] font-mono text-[10px] font-bold text-[hsl(var(--primary))]">3</span>
                  <span><strong>Accept offers:</strong> Negotiate or confirm with bulk buyers</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary)/.15)] font-mono text-[10px] font-bold text-[hsl(var(--primary))]">4</span>
                  <span><strong>Dispatch:</strong> Handover to verified driver with OTP</span>
                </div>
              </div>
            </div>

            {/* Bulk Buyer Journey */}
            <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-xs">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🏪</span>
                <span className="font-display font-bold text-[hsl(var(--foreground))]">Bulk Buyer Journey</span>
              </div>
              <div className="mt-5 space-y-3.5">
                <div className="flex items-start gap-2.5 text-xs">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 font-mono text-[10px] font-bold text-amber-700 dark:text-amber-300">1</span>
                  <span><strong>Search lots:</strong> Filter by crop, variety, distance & quality</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 font-mono text-[10px] font-bold text-amber-700 dark:text-amber-300">2</span>
                  <span><strong>Compare mandi rates:</strong> Benchmark against APMC pricing</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 font-mono text-[10px] font-bold text-amber-700 dark:text-amber-300">3</span>
                  <span><strong>Place bulk order:</strong> Direct wholesale payment or negotiation</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 font-mono text-[10px] font-bold text-amber-700 dark:text-amber-300">4</span>
                  <span><strong>Track delivery:</strong> Live transit milestones to destination</span>
                </div>
              </div>
            </div>

            {/* Consumer Journey */}
            <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-xs">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🛒</span>
                <span className="font-display font-bold text-[hsl(var(--foreground))]">Consumer Journey</span>
              </div>
              <div className="mt-5 space-y-3.5">
                <div className="flex items-start gap-2.5 text-xs">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 font-mono text-[10px] font-bold text-blue-700 dark:text-blue-300">1</span>
                  <span><strong>Browse farm produce:</strong> Fresh harvested fruits and vegetables</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 font-mono text-[10px] font-bold text-blue-700 dark:text-blue-300">2</span>
                  <span><strong>Order directly:</strong> Add household pack sizes to cart</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 font-mono text-[10px] font-bold text-blue-700 dark:text-blue-300">3</span>
                  <span><strong>Pay transparently:</strong> Clear prices without intermediary markups</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 font-mono text-[10px] font-bold text-blue-700 dark:text-blue-300">4</span>
                  <span><strong>Receive at doorstep:</strong> Fresh farm delivery verified</span>
                </div>
              </div>
            </div>

            {/* Driver Journey */}
            <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-xs">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🚚</span>
                <span className="font-display font-bold text-[hsl(var(--foreground))]">Driver Journey</span>
              </div>
              <div className="mt-5 space-y-3.5">
                <div className="flex items-start gap-2.5 text-xs">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-orange-500/20 font-mono text-[10px] font-bold text-orange-700 dark:text-orange-300">1</span>
                  <span><strong>View requests:</strong> See route, load weight & payout</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-orange-500/20 font-mono text-[10px] font-bold text-orange-700 dark:text-orange-300">2</span>
                  <span><strong>Accept job:</strong> Lock transport assignment securely</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-orange-500/20 font-mono text-[10px] font-bold text-orange-700 dark:text-orange-300">3</span>
                  <span><strong>Pick up from farm:</strong> Verify batch with farmer OTP</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-orange-500/20 font-mono text-[10px] font-bold text-orange-700 dark:text-orange-300">4</span>
                  <span><strong>Confirm delivery:</strong> Complete handover and receive payout</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. MARKET INTELLIGENCE BENCHMARK */}
      <section className="border-t border-[#e2eae5] bg-white px-5 py-14 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div className="max-w-xl">
              <div className="font-mono-ui text-[10px] font-bold uppercase tracking-[.18em] text-[#155337]">
                Official Market Data
              </div>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#163625] sm:text-4xl">
                Mandi Price Intelligence
              </h2>
              <p className="mt-2 text-sm text-[#587265]">
                Official APMC mandi market reference rates to benchmark transparent trade values.
              </p>
            </div>
            <Link
              href="/insights"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#cbd8d0] bg-white px-4 py-2.5 text-xs font-semibold text-[#155337] hover:bg-stone-50 transition-colors shadow-2xs self-start md:self-auto"
              data-testid="link-view-all-mandi-insights"
            >
              <span>Explore All Mandi Prices</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { commodity: "Onion", variety: "Nashik Red", market: "Nashik APMC", state: "Maharashtra", modal: "₹1,850", unit: "₹ / quintal" },
              { commodity: "Potato", variety: "Jyoti", market: "Agra Mandi", state: "Uttar Pradesh", modal: "₹1,420", unit: "₹ / quintal" },
              { commodity: "Tomato", variety: "Hybrid", market: "Kolar APMC", state: "Karnataka", modal: "₹2,100", unit: "₹ / quintal" },
              { commodity: "Wheat", variety: "Sharbati", market: "Sehore Mandi", state: "Madhya Pradesh", modal: "₹2,680", unit: "₹ / quintal" },
            ].map((item) => (
              <div key={item.commodity} className="rounded-xl border border-[#e2eae5] bg-[#fafbf9] p-4 shadow-2xs">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#163625]">{item.commodity}</span>
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                    Official APMC
                  </span>
                </div>
                <div className="mt-1 text-xs text-[#587265]">{item.variety}</div>
                <div className="mt-3 flex items-baseline justify-between border-t border-[#e2eae5] pt-3">
                  <div>
                    <div className="text-[10px] text-stone-500">{item.market}</div>
                    <div className="text-[10px] text-stone-400">{item.state}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono-ui text-base font-bold text-[#155337]">{item.modal}</div>
                    <div className="text-[9px] text-stone-500">{item.unit}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. FOOTER */}
      <footer className="border-t border-[hsl(var(--border))] px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 text-xs text-[hsl(var(--muted-foreground))]">
          <span>
            © 2026 Farm2Fork · A market companion for Indian agriculture
          </span>
          <div className="flex items-center gap-3">
            <span
              className={
                health.data?.status === "ok" ? "text-[hsl(var(--primary))]" : ""
              }
            >
              {health.data?.status === "ok"
                ? "Market desk online"
                : "Market data unavailable"}
            </span>
            <button
              type="button"
              onClick={() => {
                setChecking(true);
                void health.refetch().finally(() => setChecking(false));
              }}
              className="underline"
              data-testid="button-check-health"
            >
              {checking ? "Checking…" : "Check connection"}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function FarmerDashboard() {
  const { profile } = useAuth();
  const dashboard = useGetDashboard();
  const listings = useListFarmerListings();
  const orders = useListFarmerOrders();
  const insights = useGetMarketInsights();
  const farmerCall = useCall({ listenForIncoming: true });
  const data = dashboard.data;
  const cropData = listings.data ?? [];
  const orderData = orders.data ?? [];
  const activeListings = cropData.filter(
    (listing) => listing.status === "ACTIVE",
  );
  const inactiveListings = cropData.filter(
    (listing) => listing.status === "INACTIVE",
  );
  const availableQuantity = cropData.reduce(
    (total, listing) => total + listing.quantity,
    0,
  );
  return (
    <div className="space-y-8">
      {farmerCall.incomingCall && farmerCall.callState === "incoming" && (
        <IncomingCallDialog
          farmerName={farmerCall.incomingCall.farmer_name}
          farmerPhotoUrl={farmerCall.incomingCall.farmer_photo_url}
          orderRef={String(farmerCall.incomingCall.order_id)}
          onAccept={() => void farmerCall.acceptIncomingCall(farmerCall.incomingCall!.call_id)}
          onDecline={() => void farmerCall.declineIncomingCall(farmerCall.incomingCall!.call_id)}
        />
      )}
      {farmerCall.callState !== "idle" && farmerCall.callState !== "incoming" && (
        <ActiveCallDialog
          status={farmerCall.callState}
          callTimerSeconds={farmerCall.callTimerSeconds}
          isMuted={farmerCall.isMuted}
          onMute={farmerCall.toggleMute}
          onEnd={() => void farmerCall.endCall()}
        />
      )}
      <SectionTitle
        eyebrow="Farmer Workspace"
        title={profile?.name ? `Welcome, ${profile.name}` : "Farmer Dashboard"}
        detail="Manage your crop lots, review incoming orders, and inspect market prices."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/farmer/sell"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-4 text-xs font-semibold text-white shadow-xs hover:bg-[hsl(var(--primary)/.9)]"
              data-testid="link-add-crop"
            >
              <Plus size={15} /> List Crop
            </Link>
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <Link href="/farmer" className="rounded-md border border-[hsl(var(--primary))] bg-[hsl(var(--primary))] px-3 py-1 font-semibold text-white">Dashboard</Link>
        <Link href="/farmer/crops" className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-1 font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]">My Crops ({cropData.length})</Link>
        <Link href="/farmer/sell" className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-1 font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]">Add Crop</Link>
        <Link href="/orders" className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-1 font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]">Orders ({orderData.length})</Link>
        <Link href="/insights" className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-1 font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]">Market Prices</Link>
        <Link href="/profile" className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-1 font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]">My Profile</Link>
      </div>
      <QueryState
        loading={listings.isLoading || dashboard.isLoading || orders.isLoading}
        error={Boolean(listings.error || dashboard.error || orders.error)}
        onRetry={() => {
          void listings.refetch();
          void dashboard.refetch();
          void orders.refetch();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total listings"
            value={String(cropData.length)}
            detail="Your complete crop shelf"
            icon={<PackageSearch size={17} />}
          />
          <StatCard
            label="Active listings"
            value={String(activeListings.length)}
            detail="Visible to future buyers"
            icon={<Sprout size={17} />}
            accent
          />
          <StatCard
            label="Inactive listings"
            value={String(inactiveListings.length)}
            detail="Kept safely in your records"
            icon={<Clock3 size={17} />}
          />
          <StatCard
            label="Available quantity"
            value={`${availableQuantity.toLocaleString("en-IN")} kg`}
            detail="Across your listings"
            icon={<Package size={17} />}
          />
        </div>
        <div className="grid gap-5 lg:grid-cols-[1.4fr_.8fr]">
          <div id="my-farm" className="scroll-mt-20 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 sm:p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-mono-ui text-[10px] font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">
                  Your shelf
                </div>
                <h2 className="mt-1 font-display text-2xl font-bold">
                  Active listings
                </h2>
              </div>
              <Link
                href="/farmer/crops"
                className="text-xs font-bold text-[hsl(var(--primary))]"
                data-testid="link-all-crops"
              >
                View all
              </Link>
            </div>
            <div className="mt-5 divide-y divide-[hsl(var(--border))]">
              {activeListings.slice(0, 3).map((listing) => (
                <FarmerListingRow key={listing.id} listing={listing} />
              ))}
              {activeListings.length === 0 && (
                <div className="py-6 text-sm text-[hsl(var(--muted-foreground))]">
                  Your active shelf is empty. Add a crop to get started.
                </div>
              )}
            </div>
          </div>
          <div className="rounded-2xl bg-[hsl(var(--primary))] p-6 text-white">
            <div className="flex items-center justify-between">
              <div className="font-mono-ui text-[10px] font-bold uppercase tracking-[.16em] text-white/55">
                Market pulse
              </div>
              <TrendingUp size={18} className="text-[hsl(var(--accent))]" />
            </div>
            <h2 className="mt-2 font-display text-3xl font-bold">
              {insights.data?.crop === "Market data unavailable" || !insights.data ? "Official market signal" : `${insights.data.crop} market signal`}
            </h2>
            <p className="mt-3 text-sm leading-6 text-white/65">
              {insights.data?.recommendation ??
                "Add a clear crop listing with an accurate quantity, price, and harvest date."}
            </p>
            <div className="mt-8 flex items-end justify-between border-t border-white/15 pt-4">
              <span className="text-xs text-white/55">Active crop lots</span>
              <span className="font-mono-ui text-lg text-[hsl(var(--accent))]">
                {activeListings.length}
              </span>
            </div>
            <Link
              href="/farmer/crops"
              className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-[hsl(var(--accent))]"
              data-testid="link-full-insights"
            >
              Manage your shelf <ChevronDown size={14} className="-rotate-90" />
            </Link>
          </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-[1.4fr_.8fr]">
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-bold">
                Recent activity
              </h2>
              <button
                type="button"
                className="text-xs font-bold text-[hsl(var(--primary))]"
                data-testid="button-view-activity"
              >
                View all
              </button>
            </div>
            <div className="mt-4 space-y-4">
              {(data?.recentActivity ?? []).map((item) => (
                <div key={item.id} className="flex gap-3">
                  <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--primary))]">
                    <CircleDollarSign size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-3 text-sm font-semibold">
                      <span>{item.title}</span>
                      <span className="shrink-0 text-[10px] font-normal text-[hsl(var(--muted-foreground))]">
                        {item.time}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
              {!data?.recentActivity?.length && (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  Activity will appear here as your shelf gets used.
                </p>
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 sm:p-6">
            <h2 className="font-display text-2xl font-bold">Next up</h2>
            <div className="mt-5 space-y-4">
              {orderData.slice(0, 2).map((order) => (
                <div key={order.id} className="flex gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--accent)/.25)] text-[hsl(var(--primary))]">
                    <Package size={16} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">
                      Order #{order.id}
                    </div>
                    <div className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                      {order.items[0]?.quantity ?? 0} {order.items[0]?.unit ?? ""} · {order.items[0]?.crop_name ?? "item"}
                    </div>
                  </div>
                </div>
              ))}
              {!orderData.length && (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  Orders will appear here when buyers place them.
                </p>
              )}
              <Link
                href="/orders"
                className="block border-t border-[hsl(var(--border))] pt-4 text-xs font-bold text-[hsl(var(--primary))]"
                data-testid="link-orders-dashboard"
              >
                See order desk{" "}
                <ChevronDown size={13} className="ml-1 inline -rotate-90" />
              </Link>
            </div>
          </div>
        </div>
      </QueryState>
    </div>
  );
}

function CropRow({ crop, action }: { crop: Crop; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-3.5">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--muted))] font-display text-lg font-bold text-[hsl(var(--primary))]">
        {crop.crop.slice(0, 1)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">
          {crop.crop}{" "}
          <span className="font-normal text-[hsl(var(--muted-foreground))]">
            · {crop.variety}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
          {crop.quantity} {crop.unit} · {money(crop.price)}/{crop.unit}
        </div>
      </div>
      {action ?? (
        <Badge tone={crop.status === "active" ? "green" : "neutral"}>
          {crop.status}
        </Badge>
      )}
    </div>
  );
}

function FarmerListingRow({ listing }: { listing: FarmerListing }) {
  return (
    <div className="flex items-center gap-3 py-3.5">
      <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[hsl(var(--muted))] font-display text-lg font-bold text-[hsl(var(--primary))]">
        {listing.image_url ? (
          <img
            src={listing.image_url}
            alt=""
            className="size-full object-cover"
          />
        ) : (
          listing.crop_name.slice(0, 1)
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">
          {listing.crop_name}{" "}
          <span className="font-normal text-[hsl(var(--muted-foreground))]">
            · {listing.variety ?? "Standard lot"}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
          {listing.quantity} {listing.unit} · {money(listing.price)}/
          {listing.unit}
        </div>
      </div>
      <Badge tone="green">Active</Badge>
    </div>
  );
}

function EditListingForm({
  listing,
  onCancel,
  onSaved,
}: {
  listing: FarmerListing;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const updateListing = useUpdateFarmerListing();
  const [form, setForm] = useState({
    crop_name: listing.crop_name,
    variety: listing.variety ?? "",
    quantity: String(listing.quantity),
    unit: listing.unit,
    price: String(listing.price),
    quality: listing.quality ?? "",
    location: listing.location,
    harvest_date: listing.harvest_date ?? "",
  });
  const [feedback, setFeedback] = useState("");
  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const quantity = Number(form.quantity);
    const price = Number(form.price);
    if (
      !form.crop_name.trim() ||
      !form.location.trim() ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      setFeedback(
        "Add a crop name, location, positive quantity, and a non-negative price.",
      );
      return;
    }
    setFeedback("");
    try {
      await updateListing.mutateAsync({
        id: listing.id,
        data: {
          crop_name: form.crop_name.trim(),
          variety: form.variety.trim() || null,
          quantity,
          unit: form.unit,
          price,
          quality: form.quality.trim() || null,
          location: form.location.trim(),
          harvest_date: form.harvest_date || null,
        },
      });
      onSaved();
    } catch (error) {
      setFeedback(
        farmerListingError(
          error,
          "The listing could not be updated. Please try again.",
        ),
      );
    }
  };
  return (
    <form
      onSubmit={submit}
      className="col-span-full rounded-2xl border border-[hsl(var(--primary))] bg-[hsl(var(--card))] p-5"
      data-testid={`form-edit-crop-${listing.id}`}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Crop name"
          value={form.crop_name}
          onChange={(value) => update("crop_name", value)}
          test="edit-crop-name"
        />
        <Field
          label="Variety"
          value={form.variety}
          onChange={(value) => update("variety", value)}
          test="edit-variety"
        />
        <Field
          label="Quantity"
          value={form.quantity}
          onChange={(value) => update("quantity", value)}
          type="number"
          test="edit-quantity"
        />
        <Field
          label="Unit"
          value={form.unit}
          onChange={(value) => update("unit", value)}
          options={["kg", "quintal", "tonne"]}
          test="edit-unit"
        />
        <Field
          label="Price (₹ / unit)"
          value={form.price}
          onChange={(value) => update("price", value)}
          type="number"
          test="edit-price"
        />
        <Field
          label="Harvest date"
          value={form.harvest_date}
          onChange={(value) => update("harvest_date", value)}
          type="date"
          test="edit-harvest-date"
        />
        <Field
          label="Location"
          value={form.location}
          onChange={(value) => update("location", value)}
          test="edit-location"
        />
        <Field
          label="Quality"
          value={form.quality}
          onChange={(value) => update("quality", value)}
          options={["A", "Premium", "B"]}
          test="edit-quality"
        />
      </div>
      {feedback && <Feedback message={feedback} kind="error" />}
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={updateListing.isPending}>
          {updateListing.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

export function SellCrop() {
  const [, setLocation] = useLocation();
  const createListing = useCreateFarmerListing();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [images, setImages] = useState<File[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [form, setForm] = useState({
    crop_name: "Potato",
    variety: "Kufri Jyoti",
    state: "Uttar Pradesh",
    district: "Kanpur Nagar",
    location: "Kanpur Nagar, Uttar Pradesh",
    quantity: "",
    unit: "kg",
    price: "",
    harvest_date: "",
    quality: "A",
  });
  const update = (key: string, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    if (submitting) return;
    const quantity = Number(form.quantity);
    const price = Number(form.price);
    const effectiveLocation = form.location.trim() || (form.district && form.state ? `${form.district}, ${form.state}` : "");
    if (
      !form.crop_name.trim() ||
      !effectiveLocation ||
      !form.unit ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      setFeedback(
        "Add a crop name, state & district location, positive quantity, and a non-negative price.",
      );
      return;
    }
    if (!images.length) {
      setFeedback("Add at least one clear crop photo before publishing.");
      setStep(3);
      return;
    }
    setSubmitting(true);
    setFeedback("");
    try {
      const varietyNormalized = displayVariety(form.crop_name, form.variety);
      const created = await createListing.mutateAsync({
        data: {
          crop_name: form.crop_name.trim(),
          variety: varietyNormalized === "Other / Not specified" ? null : varietyNormalized,
          quantity,
          unit: form.unit,
          price,
          quality: form.quality.trim() || null,
          location: effectiveLocation,
          harvest_date: form.harvest_date || null,
        },
      });
      // The first image remains the legacy card cover; all assets are retained as listing media.
      if (images[0]) await uploadFarmerListingImage(created.id, images[0]);
      for (const file of images) await uploadFarmerListingMedia(created.id, file);
      if (video) await uploadFarmerListingMedia(created.id, video);
      void queryClient.invalidateQueries({
        queryKey: getListFarmerListingsQueryKey(),
      });
      setFeedback("Your crop listing was saved.");
      setTimeout(() => setLocation("/farmer/crops"), 900);
    } catch (error) {
      setFeedback(
        farmerListingError(
          error,
          "The crop listing could not be saved. Please try again.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };
  const fields =
    step === 1 ? (
      <>
        <div>
          <label className="text-sm font-semibold">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              Crop Name
            </span>
            <select
              value={form.crop_name}
              onChange={(e) => {
                const selected = e.target.value;
                const vars = OFFICIAL_CROP_CATALOG[selected] || ["Other / Not specified"];
                setForm((prev) => ({
                  ...prev,
                  crop_name: selected,
                  variety: vars[0] ?? "Other / Not specified",
                }));
              }}
              className="min-h-11 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary))]"
              data-testid="select-crop-name"
            >
              <option value="">-- Select Crop --</option>
              {Object.keys(OFFICIAL_CROP_CATALOG).map((crop) => (
                <option key={crop} value={crop}>
                  {crop}
                </option>
              ))}
              <option value="Other">Other Crop</option>
            </select>
          </label>
        </div>
        {form.crop_name === "Other" && (
          <Field
            label="Custom Crop Name"
            value={form.crop_name === "Other" ? "" : form.crop_name}
            onChange={(v) => update("crop_name", v)}
            placeholder="e.g. Mustard, Barley, Bajra"
            test="custom-crop-name"
          />
        )}
        <div>
          <label className="text-sm font-semibold">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              Variety
            </span>
            {OFFICIAL_CROP_CATALOG[form.crop_name] ? (
              <select
                value={form.variety}
                onChange={(e) => update("variety", e.target.value)}
                className="min-h-11 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary))]"
                data-testid="select-crop-variety"
              >
                {OFFICIAL_CROP_CATALOG[form.crop_name].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={form.variety}
                onChange={(e) => update("variety", e.target.value)}
                placeholder="e.g. Standard variety, or Other / Not specified"
                className="min-h-11 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary))]"
                data-testid="crop-variety-input"
              />
            )}
          </label>
        </div>
        <Field
          label="Quality / Grade"
          value={form.quality}
          onChange={(v) => update("quality", v)}
          options={["A", "Premium", "B"]}
          test="quality"
        />
      </>
    ) : step === 2 ? (
      <>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Available quantity"
            value={form.quantity}
            onChange={(v) => update("quantity", v)}
            test="quantity"
            type="number"
          />
          <Field
            label="Unit"
            value={form.unit}
            onChange={(v) => update("unit", v)}
            options={["kg", "quintal", "tonne"]}
            test="unit"
          />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Your asking price (₹ / unit)"
            value={form.price}
            onChange={(v) => update("price", v)}
            test="price"
            type="number"
          />
          <Field
            label="Expected harvest date"
            value={form.harvest_date}
            onChange={(v) => update("harvest_date", v)}
            test="harvest-date"
            type="date"
          />
        </div>
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.3)] p-4">
          <StateDistrictSelector
            selectedState={form.state}
            selectedDistrict={form.district}
            onStateChange={(s) => {
              setForm((prev) => ({
                ...prev,
                state: s,
                district: "",
                location: s,
              }));
            }}
            onDistrictChange={(d) => {
              setForm((prev) => ({
                ...prev,
                district: d,
                location: d && prev.state ? `${d}, ${prev.state}` : d || prev.state,
              }));
            }}
            stateLabel="Where is it grown? (State)"
            districtLabel="District / Mandi Catchment"
            required
            stateTestId="crop-state"
            districtTestId="crop-district"
          />
        </div>
      </>
    ) : (
      <>
        <label className="block text-sm font-semibold">
          <span className="mb-2 block">Crop photos (1–8 required)</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(event) => {
              const next = Array.from(event.target.files ?? []);
              if (!next.length || next.length > 8 || next.some((file) => file.size > 5 * 1024 * 1024)) {
                setFeedback("Add 1–8 JPG, PNG, or WebP photos, each 5 MB or smaller.");
                setImages([]);
                return;
              }
              setFeedback("");
              setImages(next);
            }}
            className="min-h-12 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-3 text-sm"
            data-testid="input-crop-image"
          />
        </label>
        <label className="block text-sm font-semibold">
          <span className="mb-2 block">Short crop video (optional, MP4/WebM/MOV, max 50 MB)</span>
          <input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(event) => {
            const next = event.target.files?.[0] ?? null;
            if (next && next.size > 50 * 1024 * 1024) { setFeedback("Crop videos must be 50 MB or smaller."); setVideo(null); return; }
            setVideo(next); setFeedback("");
          }} className="min-h-12 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-3 text-sm" data-testid="input-crop-video" />
        </label>
        <div className="rounded-2xl bg-[hsl(var(--muted))] p-4 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
          <strong className="text-[hsl(var(--foreground))]">
            A clear listing gets seen first.
          </strong>
          <br />
          Use an accurate quantity, quality, location, and harvest date so
          buyers can plan with confidence.
        </div>
      </>
    );
  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/farmer"
        className="text-sm font-semibold text-[hsl(var(--muted-foreground))]"
        data-testid="link-back-farmer"
      >
        ← Back to my farm
      </Link>
      <div className="mt-7 grid gap-10 md:grid-cols-[.62fr_1.38fr]">
        <div>
          <div className="font-mono-ui text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--primary))]">
            New listing
          </div>
          <h1 className="mt-2 font-display text-4xl font-bold tracking-[-.05em]">
            Put your harvest
            <br />
            on the shelf.
          </h1>
          <p className="mt-4 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
            Three short steps. You stay in control of the price.
          </p>
          <div className="mt-10 space-y-5">
            {["The crop", "The terms", "The image"].map((label, i) => (
              <button
                type="button"
                key={label}
                onClick={() => i + 1 <= step && setStep(i + 1)}
                className="flex items-center gap-3 text-left"
                data-testid={`button-step-${i + 1}`}
              >
                <span
                  className={`flex size-8 items-center justify-center rounded-full font-mono-ui text-xs font-bold ${i + 1 === step ? "bg-[hsl(var(--primary))] text-white" : i + 1 < step ? "bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]" : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"}`}
                >
                  {i + 1}
                </span>
                <span
                  className={`text-sm font-semibold ${i + 1 === step ? "" : "text-[hsl(var(--muted-foreground))]"}`}
                >
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-[0_12px_30px_hsl(158_28%_16%/.06)] sm:p-8">
          <div className="mb-7 flex items-center justify-between">
            <div>
              <div className="font-display text-2xl font-bold">
                {step === 1
                  ? "Tell us about it"
                  : step === 2
                    ? "Set your terms"
                    : "Add a photo"}
              </div>
              <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                Step {step} of 3
              </div>
            </div>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
              <div
                className="h-full rounded-full bg-[hsl(var(--accent))] transition-all"
                style={{ width: `${step * 33.3}%` }}
              />
            </div>
          </div>
          <div className="space-y-5">{fields}</div>
          {feedback && (
            <div className="mt-5">
              <Feedback
                message={feedback}
                kind={submitting || createListing.isError ? "error" : "success"}
              />
            </div>
          )}
          <div className="mt-8 flex justify-between gap-3 border-t border-[hsl(var(--border))] pt-5">
            {step > 1 ? (
              <Button
                variant="ghost"
                onClick={() => setStep(step - 1)}
                data-testid="button-previous-step"
              >
                Previous
              </Button>
            ) : (
              <span />
            )}
            {step < 3 ? (
              <Button
                onClick={() => setStep(step + 1)}
                data-testid="button-next-step"
              >
                Continue <ChevronDown size={16} className="-rotate-90" />
              </Button>
            ) : (
              <LoadingButton
                onClick={submit}
                pending={submitting}
                data-testid="button-publish-crop"
              >
                Publish crop <CheckCircle2 size={16} />
              </LoadingButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  options,
  placeholder,
  type = "text",
  test,
  autoComplete,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options?: string[];
  placeholder?: string;
  type?: string;
  test: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="block text-sm font-semibold">
      <span className="mb-2 block">{label}</span>
      {options ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-12 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 outline-none focus:border-[hsl(var(--primary))]"
          data-testid={`select-${test}`}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-12 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 outline-none focus:border-[hsl(var(--primary))]"
          data-testid={`input-${test}`}
        />
      )}
    </label>
  );
}

export function CropListings() {
  const query = useListFarmerListings();
  const updateListing = useUpdateFarmerListing();
  const queryClient = useQueryClient();
  const crops = query.data ?? [];
  const [filter, setFilter] = useState("all");
  const [feedback, setFeedback] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const visible =
    filter === "all" ? crops : crops.filter((crop) => crop.status === filter);
  const deactivate = (listing: FarmerListing) =>
    updateListing.mutate(
      { id: listing.id, data: { status: "INACTIVE" } },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getListFarmerListingsQueryKey(),
          });
          setFeedback(`${listing.crop_name} was deactivated.`);
        },
        onError: (error) =>
          setFeedback(
            farmerListingError(
              error,
              "The listing could not be deactivated. Please try again.",
            ),
          ),
      },
    );
  const toggleSelected = (listingId: string) =>
    setSelectedIds((current) =>
      current.includes(listingId)
        ? current.filter((id) => id !== listingId)
        : [...current, listingId],
    );
  const deleteSelected = async (listingIds: string[]) => {
    if (!listingIds.length || deleting) return;
    const confirmed = window.confirm(
      `Permanently delete ${listingIds.length} crop listing${listingIds.length === 1 ? "" : "s"}?`,
    );
    if (!confirmed) return;
    setDeleting(true);
    setFeedback("");
    try {
      for (const listingId of listingIds) await deleteFarmerListing(listingId);
      setSelectedIds([]);
      await queryClient.invalidateQueries({
        queryKey: getListFarmerListingsQueryKey(),
      });
      setFeedback(`${listingIds.length} listing${listingIds.length === 1 ? "" : "s"} deleted.`);
    } catch (error) {
      setFeedback(
        farmerListingError(error, "The listing could not be deleted. Please try again."),
      );
    } finally {
      setDeleting(false);
    }
  };
  const allVisibleSelected = visible.length > 0 && visible.every((listing) => selectedIds.includes(listing.id));
  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Your produce"
        title="Crop listings"
        detail={`${crops.length} lots in your market shelf`}
        action={
          <Link
            href="/farmer/sell"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-bold text-white"
            data-testid="link-new-listing"
          >
            <Plus size={17} /> New listing
          </Link>
        }
      />
      {feedback && (
        <Feedback
          message={feedback}
          kind={updateListing.isError ? "error" : "success"}
        />
      )}
      <div className="flex items-center gap-2 border-b border-[hsl(var(--border))] pb-3">
        <div className="flex flex-wrap rounded-xl bg-[hsl(var(--muted))] p-1">
          {[
            ["all", "All"],
            ["ACTIVE", "Active"],
            ["INACTIVE", "Inactive"],
            ["SOLD", "Sold"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              onClick={() => setFilter(value)}
              className={`rounded-lg px-3 py-2 text-xs font-bold ${filter === value ? "bg-[hsl(var(--card))] shadow-sm" : "text-[hsl(var(--muted-foreground))]"}`}
              data-testid={`button-filter-${value.toLowerCase()}`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-[hsl(var(--muted-foreground))]">
          {visible.length} shown
        </span>
      </div>
      {visible.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={() =>
                setSelectedIds(
                  allVisibleSelected
                    ? selectedIds.filter((id) => !visible.some((listing) => listing.id === id))
                    : Array.from(new Set([...selectedIds, ...visible.map((listing) => listing.id)])),
                )
              }
              disabled={deleting}
              data-testid="checkbox-select-all-crops"
            />
            Select All
          </label>
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            {selectedIds.length} selected
          </span>
          {selectedIds.length > 0 && (
            <Button
              variant="danger"
              onClick={() => void deleteSelected(selectedIds)}
              disabled={deleting}
              data-testid="button-delete-selected-crops"
            >
              <Trash2 size={14} /> Delete Selected
            </Button>
          )}
        </div>
      )}
      <QueryState
        loading={query.isLoading}
        error={Boolean(query.error)}
        onRetry={() => void query.refetch()}
      >
        {visible.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {visible.map((listing) =>
              editingId === listing.id ? (
                <EditListingForm
                  key={listing.id}
                  listing={listing}
                  onCancel={() => setEditingId(null)}
                  onSaved={() => {
                    setEditingId(null);
                    void queryClient.invalidateQueries({
                      queryKey: getListFarmerListingsQueryKey(),
                    });
                    setFeedback("Listing updated.");
                  }}
                />
              ) : (
                <div
                  key={listing.id}
                  className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 transition-transform hover:-translate-y-0.5"
                  data-testid={`card-crop-${listing.id}`}
                >
                  <label className="mb-3 inline-flex cursor-pointer items-center gap-2 text-xs font-semibold">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(listing.id)}
                      onChange={() => toggleSelected(listing.id)}
                      disabled={deleting}
                      data-testid={`checkbox-crop-${listing.id}`}
                    />
                    Select
                  </label>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-24 w-32 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[hsl(var(--muted))] font-display text-xl font-bold text-[hsl(var(--primary))]">
                        {listing.image_url ? (
                          <img
                            src={listing.image_url}
                            alt=""
                            className="size-full object-cover"
                          />
                        ) : (
                          listing.crop_name.slice(0, 1)
                        )}
                      </div>
                      <div>
                        <h2 className="font-display text-xl font-bold">
                          {listing.crop_name}
                        </h2>
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">
                          {listing.variety ?? "Standard lot"} ·{" "}
                          {listing.quality ?? "Quality not specified"}
                        </p>
                      </div>
                    </div>
                    <Badge
                      tone={
                        listing.status === "ACTIVE"
                          ? "green"
                          : listing.status === "SOLD"
                            ? "gold"
                            : "neutral"
                      }
                    >
                      {listing.status}
                    </Badge>
                  </div>
                  <div className="mt-6 grid grid-cols-3 gap-3 border-y border-[hsl(var(--border))] py-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                        Available
                      </div>
                      <div className="mt-1 font-mono-ui text-sm font-bold">
                        {listing.quantity} {listing.unit}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                        Asking
                      </div>
                      <div className="mt-1 font-mono-ui text-sm font-bold">
                        {money(listing.price)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                        Harvest
                      </div>
                      <div className="mt-1 font-mono-ui text-sm font-bold">
                        {listing.harvest_date
                          ? date(listing.harvest_date)
                          : "Not set"}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]">
                      <MapPin size={14} /> {listing.location}
                    </span>
                    <div className="flex items-center gap-1">
                      <Link
                        href={`/farmer/crops/${listing.id}`}
                        className="rounded-lg px-3 py-2 text-xs font-bold text-[hsl(var(--primary))]"
                        data-testid={`button-view-crop-${listing.id}`}
                      >
                        View
                      </Link>
                      <Button
                        variant="ghost"
                        onClick={() => setEditingId(listing.id)}
                        data-testid={`button-edit-crop-${listing.id}`}
                      >
                        <Pencil size={14} /> Edit
                      </Button>
                      {listing.status === "ACTIVE" && (
                        <Button
                          variant="ghost"
                          onClick={() => deactivate(listing)}
                          disabled={updateListing.isPending}
                          data-testid={`button-deactivate-crop-${listing.id}`}
                        >
                          Deactivate
                        </Button>
                      )}
                      <Button
                        variant="danger"
                        onClick={() => void deleteSelected([listing.id])}
                        disabled={deleting}
                        data-testid={`button-delete-crop-${listing.id}`}
                      >
                        <Trash2 size={14} /> Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ),
            )}
          </div>
        ) : (
          <EmptyState
            title="Your shelf is quiet"
            detail="List a crop when it is ready and buyers looking for your harvest can find you."
            action={
              <Link
                href="/farmer/sell"
                className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-bold text-white"
                data-testid="link-empty-listing"
              >
                List a crop
              </Link>
            }
          />
        )}
      </QueryState>
    </div>
  );
}

export function Marketplace() {
  const [search, setSearch] = useState("");
  const [selectedCrop, setSelectedCrop] = useState("all");
  const [selectedState, setSelectedState] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [priceSort, setPriceSort] = useState<"none" | "asc" | "desc">("none");
  const query = useListMarketplaceListings();
  const allListings = query.data ?? [];
  const uniqueCrops = ["all", ...new Set(allListings.map((l) => l.crop_name).filter(Boolean))];
  const districts = selectedState ? getDistrictsForState(selectedState) : [];

  let visible = allListings.filter((listing) => {
    const matchesSearch = `${listing.crop_name} ${listing.variety ?? ""} ${listing.location}`
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesCrop = selectedCrop === "all" || listing.crop_name.toLowerCase() === selectedCrop.toLowerCase();
    const locLower = (listing.location ?? "").toLowerCase();
    const matchesState = !selectedState || locLower.includes(selectedState.toLowerCase());
    const matchesDistrict = !selectedDistrict || locLower.includes(selectedDistrict.toLowerCase());
    return matchesSearch && matchesCrop && matchesState && matchesDistrict;
  });

  if (priceSort === "asc") {
    visible = [...visible].sort((a, b) => a.price - b.price);
  } else if (priceSort === "desc") {
    visible = [...visible].sort((a, b) => b.price - a.price);
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Direct Produce Marketplace"
        title="Available Farm Lots"
        detail="Source produce directly from verified farmers and FPOs."
        action={
          <div className="hidden items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))] sm:flex">
            <ShieldCheck size={15} className="text-[hsl(var(--primary))]" />
            Direct farmer listings · Mandi benchmarked
          </div>
        }
      />
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3.5 top-3 text-[hsl(var(--muted-foreground))]"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search crop, variety, or location..."
            className="min-h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] pl-9 pr-3 text-xs outline-none focus:border-[hsl(var(--primary))]"
            data-testid="input-market-search"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedCrop}
            onChange={(e) => setSelectedCrop(e.target.value)}
            className="min-h-10 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-xs outline-none focus:border-[hsl(var(--primary))]"
          >
            <option value="all">All Crops</option>
            {uniqueCrops.filter((c) => c !== "all").map((crop) => (
              <option key={crop} value={crop}>{crop}</option>
            ))}
          </select>
          <select
            value={selectedState}
            onChange={(e) => {
              setSelectedState(e.target.value);
              setSelectedDistrict("");
            }}
            className="min-h-10 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-xs outline-none focus:border-[hsl(var(--primary))]"
          >
            <option value="">All States & UTs</option>
            {INDIAN_STATES.map((stateName) => (
              <option key={stateName} value={stateName}>{stateName}</option>
            ))}
          </select>
          <select
            value={selectedDistrict}
            onChange={(e) => setSelectedDistrict(e.target.value)}
            disabled={!selectedState}
            className="min-h-10 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-xs outline-none focus:border-[hsl(var(--primary))] disabled:opacity-50"
          >
            <option value="">{selectedState ? "All Districts" : "Select State First"}</option>
            {districts.map((districtName) => (
              <option key={districtName} value={districtName}>{districtName}</option>
            ))}
          </select>
          <select
            value={priceSort}
            onChange={(e) => setPriceSort(e.target.value as "none" | "asc" | "desc")}
            className="min-h-10 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-xs outline-none focus:border-[hsl(var(--primary))]"
          >
            <option value="none">Sort: Default</option>
            <option value="asc">Price: Low to High</option>
            <option value="desc">Price: High to Low</option>
          </select>
          {(search || selectedCrop !== "all" || priceSort !== "none" || selectedState || selectedDistrict) && (
            <Button
              variant="ghost"
              className="text-xs"
              onClick={() => {
                setSearch("");
                setSelectedCrop("all");
                setPriceSort("none");
                setSelectedState("");
                setSelectedDistrict("");
              }}
            >
              Reset
            </Button>
          )}
        </div>
      </div>
      <QueryState
        loading={query.isLoading}
        error={Boolean(query.error)}
        onRetry={() => void query.refetch()}
      >
        {visible.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((listing) => (
              <Link
                href={`/marketplace/${listing.id}`}
                key={listing.id}
                className="group flex flex-col justify-between overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] transition-colors hover:border-[hsl(var(--primary))]"
                data-testid={`card-market-crop-${listing.id}`}
              >
                <div>
                  <div className="relative flex h-36 items-end overflow-hidden bg-[hsl(var(--muted))] p-3">
                    {listing.image_url ? (
                      <img
                        src={listing.image_url}
                        alt={listing.crop_name}
                        className="absolute inset-0 size-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center font-display text-2xl font-bold text-[hsl(var(--primary))] opacity-40">
                        {listing.crop_name}
                      </div>
                    )}
                    <div className="relative flex w-full items-center justify-between">
                      <Badge tone="green">Active</Badge>
                      {listing.quality && <Badge tone="gold">Grade {listing.quality}</Badge>}
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-display text-base font-bold text-[hsl(var(--foreground))]">
                          {listing.crop_name}
                        </h3>
                        <div className="text-xs text-[hsl(var(--muted-foreground))]">
                          Variety: <span className="font-medium text-[hsl(var(--foreground))]">{displayVariety(listing.crop_name, listing.variety)}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono-ui text-base font-bold text-[hsl(var(--primary))]">
                          {money(listing.price)}
                        </div>
                        <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
                          / {listing.unit}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-[hsl(var(--muted-foreground))]">
                      <div className="flex items-center gap-1">
                        <MapPin size={12} className="shrink-0 text-[hsl(var(--primary))]" />
                        <span className="truncate">{listing.location}</span>
                      </div>
                      <div className="flex items-center justify-between pt-1 text-[11px]">
                        <span>Available: <strong className="text-[hsl(var(--foreground))]">{listing.quantity} {listing.unit}</strong></span>
                        {listing.farmer_name && (
                          <span className="truncate font-medium text-[hsl(var(--primary))]">
                            {listing.farmer_name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--muted)/.4)] px-4 py-2.5 text-center text-xs font-semibold text-[hsl(var(--primary))] group-hover:bg-[hsl(var(--primary))] group-hover:text-white transition-colors">
                  View Details & Order →
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No matching produce found"
            detail="Try adjusting your search keywords, clearing variety or location filters, or browse all lots."
            action={
              <Button
                variant="secondary"
                className="mt-4 text-xs"
                onClick={() => {
                  setSearch("");
                  setSelectedCrop("all");
                  setPriceSort("none");
                  setSelectedState("");
                  setSelectedDistrict("");
                }}
                data-testid="button-clear-market"
              >
                Clear all filters
              </Button>
            }
          />
        )}
      </QueryState>
    </div>
  );
}

export function CropDetail() {
  const params = useParams<{ id: string }>();
  const listingId = params.id ?? "";
  const query = useGetMarketplaceListing(listingId);
  const marketReference = useQuery({
    queryKey: ["market-reference", query.data?.crop_name, query.data?.variety],
    queryFn: () => getMarketPrices({ commodity: query.data!.crop_name, variety: query.data!.variety ?? undefined, limit: 1 }),
    enabled: Boolean(query.data?.crop_name), staleTime: 120_000,
  });
  const { profile } = useAuth();
  const [, setLocation] = useLocation();
  const buyerOrders = useListOrders({
    query: {
      queryKey: getListOrdersQueryKey(),
      enabled: profile?.role === "BUYER",
    },
  });
  const listing = query.data;
  const listingMedia = ((listing as (FarmerListing & { media?: { id: string; media_type: "IMAGE" | "VIDEO"; url?: string | null }[] }) | undefined)?.media ?? []);
  const photos = listingMedia.filter((media) => media.media_type === "IMAGE" && media.url);
  const video = listingMedia.find((media) => media.media_type === "VIDEO" && media.url);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);

  const allPhotoUrls = photos.map((m) => m.url).filter((u): u is string => Boolean(u));
  if (listing?.image_url && !allPhotoUrls.includes(listing.image_url)) {
    allPhotoUrls.unshift(listing.image_url);
  }
  const activeImage = allPhotoUrls[selectedPhotoIndex] || listing?.image_url;

  const eligibleOrder = (buyerOrders.data ?? []).find(
    (order) =>
      ["PENDING", "ACCEPTED", "PROCESSING", "OUT_FOR_DELIVERY"].includes(order.status) &&
      order.items.some((item) => item.crop_listing_id === listingId),
  );
  const buyerCall = useCall({ orderId: eligibleOrder?.id });
  const createOrder = useCreateOrder();
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState("2");
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [messagePending, setMessagePending] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const openMessages = async (context: { order_id?: string; listing_id?: string }) => {
    setMessagePending(true);
    setMessageError(null);
    try {
      const conversation = await messagesApi.createConversation(context);
      setLocation(`/messages?conversation=${conversation.conversation_id}`);
    } catch {
      setMessageError("Messages could not be opened. Please try again.");
    } finally {
      setMessagePending(false);
    }
  };
  const placeOrder = () => {
    if (!listing || !deliveryLocation.trim()) return;
    createOrder.mutate(
      { data: { crop_listing_id: listing.id, quantity: Number(quantity), delivery_location: deliveryLocation.trim() } },
      {
        onSuccess: (order) => {
          setCreatedOrder(order);
          void queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getListMarketplaceListingsQueryKey() });
        },
      },
    );
  };
  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/marketplace"
        className="text-sm font-semibold text-[hsl(var(--muted-foreground))]"
        data-testid="link-back-market"
      >
        ← Back to marketplace
      </Link>
      <QueryState
        loading={query.isLoading}
        error={Boolean(query.error)}
        onRetry={() => void query.refetch()}
      >
        {listing && (
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-3">
              <div className="relative flex min-h-[320px] items-end overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-4">
                {activeImage ? (
                  <img src={activeImage} alt={listing.crop_name} className="absolute inset-0 size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center font-display text-2xl font-bold text-[hsl(var(--primary))] opacity-40">
                    {listing.crop_name}
                  </div>
                )}
                <div className="relative flex w-full items-center justify-between">
                  <Badge tone="green">Available</Badge>
                  <span className="rounded-md bg-black/60 px-2.5 py-1 text-xs text-white">
                    {listing.harvest_date ? `Harvested: ${date(listing.harvest_date)}` : "Fresh lot"}
                  </span>
                </div>
              </div>
              {allPhotoUrls.length > 1 && (
                <div className="grid grid-cols-4 gap-2">
                  {allPhotoUrls.map((url, idx) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setSelectedPhotoIndex(idx)}
                      className={`overflow-hidden rounded-lg border-2 transition-all ${
                        idx === selectedPhotoIndex ? "border-[hsl(var(--primary))] ring-1 ring-[hsl(var(--primary))]" : "border-[hsl(var(--border))] opacity-75 hover:opacity-100"
                      }`}
                    >
                      <img src={url} alt={`${listing.crop_name} ${idx + 1}`} className="h-16 w-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="py-1">
              <div className="font-mono-ui text-[11px] font-bold uppercase tracking-[.14em] text-[hsl(var(--primary))]">
                {(listing as FarmerListing & { farmer_user_id?: string | null }).farmer_user_id ? (
                  <Link href={`/profile/${(listing as FarmerListing & { farmer_user_id?: string | null }).farmer_user_id}`} className="hover:underline">
                    {listing.farmer_name ?? "Verified farm listing"}
                  </Link>
                ) : (
                  (listing.farmer_name ?? "Verified farm listing")
                )}
              </div>
              <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-[hsl(var(--foreground))]">
                {listing.crop_name}
              </h1>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                Variety: <strong className="text-[hsl(var(--foreground))]">{displayVariety(listing.crop_name, listing.variety)}</strong> · Grown in {listing.location}
              </p>
              <div className="mt-5 flex items-baseline gap-2">
                <span className="font-mono-ui text-3xl font-bold text-[hsl(var(--primary))]">{money(listing.price)}</span>
                <span className="text-sm text-[hsl(var(--muted-foreground))]">per {listing.unit}</span>
              </div>
              <div className="mt-5 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--primary))]">Official Government Mandi Data</div>
                {marketReference.data?.records[0] ? <div className="mt-2 text-sm"><strong>{money(marketReference.data.records[0].modal_price ?? 0)}</strong> modal reference {marketReference.data.records[0].unit ? `/ ${marketReference.data.records[0].unit}` : "· Official unit unavailable"}<div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{marketReference.data.records[0].market ?? "Market unavailable"} · {marketReference.data.records[0].arrival_date ?? "Date unavailable"}</div></div> : <div className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">No official reference currently available. Farmer asking price remains separate.</div>}
              </div>
              {video && <div className="mt-5"><div className="mb-2 text-sm font-bold">Crop video</div><video src={video.url ?? ""} controls preload="metadata" className="w-full rounded-2xl bg-black" /></div>}
              <div className="mt-8 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
                <div className="flex items-center justify-between">
                  <label htmlFor="order-quantity" className="text-sm font-bold">Order Quantity ({listing.unit})</label>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">Lot stock: {listing.quantity} {listing.unit}</span>
                </div>

                {/* Quick quantity selection for household consumers and bulk buyers */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[1, 2, 5, 10, 25, 50, 100].filter((q) => q <= listing.quantity).map((qty) => (
                    <button
                      key={qty}
                      type="button"
                      onClick={() => setQuantity(String(qty))}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                        Number(quantity) === qty
                          ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-white"
                          : "border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary))]"
                      }`}
                    >
                      {qty} {listing.unit}
                    </button>
                  ))}
                </div>

                <input id="order-quantity" type="number" min="0.01" max={listing.quantity} step="0.01" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="mt-3 min-h-11 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 font-mono-ui text-sm" data-testid="input-order-quantity" />
                <label htmlFor="delivery-location" className="mt-4 block text-sm font-bold">Delivery location</label>
                <input id="delivery-location" value={deliveryLocation} onChange={(event) => setDeliveryLocation(event.target.value)} placeholder="City, state" className="mt-2 min-h-11 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3" data-testid="input-delivery-location" />
                <div className="mt-4 flex items-center justify-between text-sm">
                  <span className="text-[hsl(var(--muted-foreground))]">Estimated total</span>
                  <strong className="font-mono-ui">{money(listing.price * Number(quantity || 0))}</strong>
                </div>
                <LoadingButton pending={createOrder.isPending} onClick={placeOrder} className="mt-4 w-full" data-testid="button-place-order">
                  Place order <Package size={16} />
                </LoadingButton>
                {createOrder.isError && <p className="mt-3 text-sm text-red-600">The order could not be placed. Check the quantity and try again.</p>}
                {createdOrder && <div className="mt-4 rounded-xl bg-[hsl(var(--accent)/.25)] p-3 text-sm"><strong>Order confirmed.</strong><div className="mt-1">Order {createdOrder.id} · {money(createdOrder.total_amount)}</div><Link href="/orders" className="mt-2 inline-block font-bold text-[hsl(var(--primary))]">View My Orders</Link></div>}

                {/* Bulk Buyer Wholesale & Negotiation Desk */}
                {profile?.role === "BUYER" && (
                  <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 text-xs text-amber-900 dark:text-amber-200">
                    <div className="font-bold">Bulk Buyer Wholesale Negotiation</div>
                    <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">
                      Need custom truckloads, grading specifications, or negotiated batch pricing? Contact the farmer directly before placing a bulk procurement order.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => void openMessages({ listing_id: listing.id })} disabled={messagePending} className="gap-1.5 text-xs">
                        <MessageCircle size={14} /> {messagePending ? "Opening messages..." : "Negotiate Price / Message Farmer"}
                      </Button>
                      <CallButton
                        onClick={() => void buyerCall.startCall()}
                        disabled={!eligibleOrder || buyerCall.callState !== "idle"}
                        label={buyerCall.callState === "creating" ? "Starting call..." : "Call Farmer"}
                      />
                    </div>
                    {messageError && <Feedback message={messageError} kind="error" />}
                    {!eligibleOrder && (
                      <p className="mt-2 text-[10px] text-[hsl(var(--muted-foreground))]">
                        Voice calls require an active order. You can send a direct message anytime.
                      </p>
                    )}
                    <CallStatus status={buyerCall.callState} />
                    {buyerCall.error && <Feedback message={buyerCall.error} kind="error" />}
                    {buyerCall.callState !== "idle" && buyerCall.callState !== "creating" && buyerCall.callState !== "ringing" && (
                      <div className="mt-4">
                        <ActiveCallDialog
                          status={`${listing.farmer_name ?? "Farmer"} · ${listing.crop_name} · ${buyerCall.callState}`}
                          callTimerSeconds={buyerCall.callTimerSeconds}
                          isMuted={buyerCall.isMuted}
                          onMute={buyerCall.toggleMute}
                          onEnd={() => void buyerCall.endCall()}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-[hsl(var(--muted))] p-3">
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">Quality</div>
                  <div className="mt-1 font-semibold">{listing.quality ?? "Not specified"}</div>
                </div>
                <div className="rounded-xl bg-[hsl(var(--muted))] p-3">
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">Location</div>
                  <div className="mt-1 font-semibold">{listing.location}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </QueryState>
    </div>
  );
}

export function BuyerDashboard() {
  const orders = useListOrders();
  const crops = useListCrops();
  const list = orders.data ?? [];
  return (
    <div className="space-y-8">
      <SectionTitle
        eyebrow="Bulk Buyer workspace"
        title="Wholesale procurement & supply pipeline."
        detail="Your current pipeline, in one clear view."
        action={
          <Link
            href="/marketplace"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-bold text-white"
            data-testid="link-source-produce"
          >
            <Search size={17} /> Find produce
          </Link>
        }
      />
      <QueryState
        loading={orders.isLoading || crops.isLoading}
        error={Boolean(orders.error && crops.error)}
        onRetry={() => {
          void orders.refetch();
          void crops.refetch();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Open orders"
            value={String(
                list.filter((order) => !["DELIVERED", "CANCELLED", "REJECTED"].includes(order.status)).length,
            )}
            detail="Awaiting delivery"
            icon={<Package size={17} />}
            accent
          />
          <StatCard
            label="In transit"
            value={String(
                list.filter((order) => order.status === "OUT_FOR_DELIVERY").length,
            )}
            detail="Active dispatches"
            icon={<Truck size={17} />}
          />
          <StatCard
            label="Total spend"
            value={money(list.reduce((sum, order) => sum + order.total_amount, 0))}
            detail="Wholesale farm orders"
            icon={<WalletCards size={17} />}
          />
          <StatCard
            label="Available produce"
            value={String(crops.data?.length ?? 0)}
            detail="Live marketplace lots"
            icon={<Store size={17} />}
          />
        </div>
        <div className="grid gap-5 lg:grid-cols-[1.3fr_.7fr]">
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono-ui text-[10px] font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">
                  Live pipeline
                </div>
                <h2 className="mt-1 font-display text-2xl font-bold">
                  Recent orders
                </h2>
              </div>
              <Link
                href="/orders"
                className="text-xs font-bold text-[hsl(var(--primary))]"
                data-testid="link-buyer-orders"
              >
                Bulk Order desk
              </Link>
            </div>
            <div className="mt-4 divide-y divide-[hsl(var(--border))]">
              {list.map((order) => (
                <OrderRow key={order.id} order={order} />
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-[hsl(var(--accent)/.35)] text-[hsl(var(--primary))]">
              <HandCoins size={20} />
            </div>
            <h2 className="mt-7 font-display text-2xl font-bold">
              Source smarter this week.
            </h2>
            <p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
              Use verified government market records to guide your next requirement.
            </p>
            <Link
              href="/insights"
              className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-[hsl(var(--primary))]"
              data-testid="link-buyer-insights"
            >
              See market pulse <ChevronDown size={13} className="-rotate-90" />
            </Link>
          </div>
        </div>
      </QueryState>
    </div>
  );
}

function OrderRow({ order }: { order: Order }) {
  const item = order.items[0];
  return (
    <Link href={`/orders/${order.id}`} className="flex flex-wrap items-center gap-3 py-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--muted))] text-[hsl(var(--primary))]">
        <Package size={17} />
      </div>
      <div className="min-w-[150px] flex-1">
        <div className="text-sm font-bold">{item?.crop_name ?? "Order"}</div>
        <div className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
          Order #{order.id} · {item?.quantity ?? 0} {item?.unit ?? ""}
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono-ui text-sm font-bold">
          {money(order.total_amount)}
        </div>
        <Badge tone={statusTone(order.status)}>
          {order.status.replace("_", " ")}
        </Badge>
      </div>
    </Link>
  );
}

export function OrderDetail() {
  const params = useParams<{ id: string }>();
  const orderId = params.id ?? "";
  const query = useGetOrder(orderId, { query: { queryKey: getGetOrderQueryKey(orderId) } });
  const cancelOrder = useCancelOrder();
  const queryClient = useQueryClient();
  const order = query.data;
  const { profile } = useAuth();
  const [, setLocation] = useLocation();
  const [messagePending, setMessagePending] = useState(false);
  const [paymentPending, setPaymentPending] = useState(false);
  const [paymentFeedback, setPaymentFeedback] = useState("");
  const startPayment = async () => {
    if (!order) return;
    setPaymentPending(true); setPaymentFeedback("");
    try {
      const payment = await createPayment(order.id);
      if (!payment.gateway_public_key || !payment.gateway_reference) throw new Error("Razorpay is not configured on the server.");
      await new Promise<void>((resolve, reject) => {
        const finish = () => { const RazorpayConstructor = (window as Window & { Razorpay?: new (options: Record<string, unknown>) => { open: () => void } }).Razorpay; if (!RazorpayConstructor) { reject(new Error("Razorpay checkout could not load.")); return; } const checkout = new RazorpayConstructor({ key: payment.gateway_public_key, amount: Math.round(payment.amount * 100), currency: payment.currency, order_id: payment.gateway_reference, name: "Farm2Fork", description: `Order ${order.id}`, handler: async (result: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => { try { const verified = await verifyPayment(result); setPaymentFeedback(verified.status === "AUTHORIZED" ? "Payment signature verified. Final confirmation is pending Razorpay webhook." : "Payment confirmed by Farm2Fork."); resolve(); } catch (error) { reject(error); } }, modal: { ondismiss: () => reject(new Error("Payment window was closed before confirmation.")) } }); checkout.open(); };
        if ((window as Window & { Razorpay?: unknown }).Razorpay) finish(); else { const script = document.createElement("script"); script.src = "https://checkout.razorpay.com/v1/checkout.js"; script.onload = finish; script.onerror = () => reject(new Error("Razorpay checkout could not load.")); document.body.appendChild(script); }
      });
      await query.refetch();
    } catch (error) { setPaymentFeedback(error instanceof Error ? error.message : "Payment could not be completed."); }
    finally { setPaymentPending(false); }
  };
  const openOrderMessages = async () => {
    if (!order) return;
    setMessagePending(true);
    try {
      const conversation = await messagesApi.createConversation({ order_id: order.id });
      setLocation(`/messages?conversation=${conversation.conversation_id}`);
    } finally {
      setMessagePending(false);
    }
  };
  const buyerCall = useCall({ orderId });
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/orders" className="text-sm font-semibold text-[hsl(var(--muted-foreground))]">Back to orders</Link>
      <QueryState loading={query.isLoading} error={Boolean(query.error)} onRetry={() => void query.refetch()}>
        {order && (
          <div className="space-y-5">
            <SectionTitle eyebrow="Order detail" title={`Order ${order.id}`} detail={order.delivery_location} action={<Badge tone={statusTone(order.status)}>{order.status.replaceAll("_", " ")}</Badge>} />
            <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center gap-4 border-b border-[hsl(var(--border))] py-4 last:border-0">
                  {item.image_url ? <img src={item.image_url} alt={item.crop_name} className="size-16 rounded-xl object-cover" /> : <div className="flex size-16 items-center justify-center rounded-xl bg-[hsl(var(--muted))] text-2xl font-bold">{item.crop_name.slice(0, 1)}</div>}
                  <div className="min-w-0 flex-1"><div className="font-bold">{item.crop_name}</div><div className="text-sm text-[hsl(var(--muted-foreground))]">{item.quantity} {item.unit} · {money(item.price)} each</div></div>
                  <div className="font-mono-ui font-bold">{money(item.subtotal)}</div>
                </div>
              ))}
              <div className="mt-4 flex items-center justify-between border-t border-[hsl(var(--border))] pt-4"><span className="font-bold">Total</span><span className="font-mono-ui text-xl font-bold">{money(order.total_amount)}</span></div>
              <div className="mt-3 text-sm"><span className="text-[hsl(var(--muted-foreground))]">Payment: </span><strong>{order.payment_status.replaceAll("_", " ")}</strong></div>
              {paymentFeedback && <Feedback message={paymentFeedback} kind={paymentFeedback.includes("confirmed") || paymentFeedback.includes("verified") ? "success" : "error"} />}
              {profile && (profile.role === "BUYER" || profile.role === "CONSUMER") && order.payment_status !== "PAID" && order.payment_status !== "AUTHORIZED" && <Button className="mt-4" onClick={() => void startPayment()} disabled={paymentPending}>{paymentPending ? "Opening secure checkout..." : "Pay securely with Razorpay"}</Button>}
              {order.status === "PENDING" && <Button variant="secondary" className="mt-4" onClick={() => cancelOrder.mutate({ id: order.id }, { onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(order.id) }); void queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() }); } })}>Cancel order</Button>}
              {profile?.role !== "ADMIN" && order.farmer_name && <Button variant="secondary" className="mt-4 gap-2" onClick={() => void openOrderMessages()} disabled={messagePending}><MessageCircle size={16} /> {messagePending ? "Opening messages..." : profile?.role === "FARMER" ? "Message Bulk Buyer" : "Message Farmer"}</Button>}
              {order.farmer_name && <div className="mt-5 space-y-2 border-t border-[hsl(var(--border))] pt-5"><CallButton onClick={() => void buyerCall.startCall()} disabled={buyerCall.callState !== "idle"} /><CallStatus status={buyerCall.callState} />{buyerCall.error && <Feedback message={buyerCall.error} kind="error" />}</div>}
              {buyerCall.callState !== "idle" && buyerCall.callState !== "creating" && buyerCall.callState !== "ringing" && <div className="mt-4"><ActiveCallDialog status={buyerCall.callState} callTimerSeconds={buyerCall.callTimerSeconds} isMuted={buyerCall.isMuted} onMute={buyerCall.toggleMute} onEnd={() => void buyerCall.endCall()} /></div>}
            </div>
          </div>
        )}
      </QueryState>
    </div>
  );
}

export function Orders({ role }: { role: AppRole }) {
  const buyerQuery = useListOrders({ query: { queryKey: getListOrdersQueryKey(), enabled: role === "buyer" } });
  const farmerQuery = useListFarmerOrders({ query: { queryKey: getListFarmerOrdersQueryKey(), enabled: role === "farmer" } });
  const query = role === "farmer" ? farmerQuery : buyerQuery;
  const updateStatus = useUpdateFarmerOrderStatus();
  const cancelOrder = useCancelOrder();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState("");
  const orders = query.data ?? [];
  const updateFarmerStatus = (order: Order, nextStatus: "ACCEPTED" | "REJECTED") => {
    updateStatus.mutate(
      { id: order.id, data: { status: nextStatus } },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: getListFarmerOrdersQueryKey() });
          void query.refetch();
          setFeedback(`Order #${order.id} is now ${nextStatus.toLowerCase()}.`);
        },
        onError: () => setFeedback("That order update did not go through. Please refresh and try again."),
      },
    );
  };
  const advance = (order: Order) => {
    const next =
      order.status === "PENDING"
        ? "ACCEPTED"
        : order.status === "ACCEPTED"
          ? "PROCESSING"
          : order.status === "PROCESSING"
            ? "OUT_FOR_DELIVERY"
            : order.status === "OUT_FOR_DELIVERY"
              ? "DELIVERED"
            : order.status;
    if (next !== order.status)
      updateStatus.mutate(
        { id: order.id, data: { status: next } },
        {
          onSuccess: () => {
            void queryClient.invalidateQueries({
              queryKey: getListOrdersQueryKey(),
            });
            setFeedback(`Order #${order.id} is now ${next.replaceAll("_", " ")}.`);
          },
          onError: () =>
            setFeedback(
              "That status update did not go through. Please try again.",
            ),
        },
      );
  };
  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow={role === "admin" ? "Operations" : role === "buyer" ? "Bulk Buyer order desk" : "Order desk"}
        title={
          role === "admin"
            ? "Every order, accounted for."
            : "Orders that keep moving."
        }
        detail={`${orders.length} orders in your workspace`}
        action={
          <Button
            variant="secondary"
            onClick={() => window.print()}
            data-testid="button-export-orders"
          >
            <Download size={16} /> Export list
          </Button>
        }
      />
      {feedback && (
        <Feedback
          message={feedback}
          kind={updateStatus.isError ? "error" : "success"}
        />
      )}
      <QueryState
        loading={query.isLoading}
        error={Boolean(query.error)}
        onRetry={() => void query.refetch()}
      >
        {orders.length ? (
          <div className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
            <div className="hidden grid-cols-[1.4fr_1fr_.7fr_.8fr_auto] gap-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/.6)] px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] sm:grid">
              <span>Order</span>
              <span>Partner</span>
              <span>Value</span>
              <span>Status</span>
              <span />
            </div>
            {orders.map((order) => (
              <div
                key={order.id}
                className="grid gap-3 border-b border-[hsl(var(--border))] px-5 py-4 last:border-0 sm:grid-cols-[1.4fr_1fr_.7fr_.8fr_auto] sm:items-center sm:gap-4"
                data-testid={`row-order-${order.id}`}
              >
                <div>
                  <div className="text-sm font-bold">{order.items[0]?.crop_name ?? "Order"}</div>
                  <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                    #{order.id} · placed {date(order.created_at)} · {order.items[0]?.quantity ?? 0} {order.items[0]?.unit ?? ""}
                  </div>
                </div>
                <div className="text-xs">
                  <span className="text-[hsl(var(--muted-foreground))]">{role === "farmer" ? "Bulk Buyer" : "Farmer"} · </span>
                  {role === "farmer" ? order.buyer_name ?? "Bulk Buyer" : order.farmer_name ?? "Farmer"}
                </div>
                <div className="font-mono-ui text-sm font-bold">
                  {money(order.total_amount)}
                </div>
                <div>
                  <Badge tone={statusTone(order.status)}>
                    {order.status.replace("_", " ")}
                  </Badge>
                  <div className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">
                    {order.items[0]?.price ? `Unit ${money(order.items[0].price)} · ${order.delivery_location}` : order.delivery_location}
                  </div>
                </div>
                {role === "farmer" && order.status === "PENDING" ? (
                  <div className="flex gap-2">
                    <Button variant="secondary" className="min-h-9 px-3 text-xs" disabled={updateStatus.isPending} onClick={() => updateFarmerStatus(order, "ACCEPTED")} data-testid={`button-accept-order-${order.id}`}>Accept</Button>
                    <Button variant="secondary" className="min-h-9 px-3 text-xs" disabled={updateStatus.isPending} onClick={() => updateFarmerStatus(order, "REJECTED")} data-testid={`button-reject-order-${order.id}`}>Reject</Button>
                  </div>
                ) : role === "farmer" && order.status !== "DELIVERED" && order.status !== "CANCELLED" && order.status !== "REJECTED" ? (
                  <Button
                    variant="secondary"
                    className="min-h-9 px-3 text-xs"
                    onClick={() => advance(order)}
                    data-testid={`button-advance-order-${order.id}`}
                  >
                    {order.status === "PENDING" ? "Accept" : order.status === "ACCEPTED" ? "Process" : order.status === "PROCESSING" ? "Dispatch" : "Mark delivered"}
                  </Button>
                ) : role === "buyer" && order.status === "PENDING" ? (
                  <Button variant="secondary" className="min-h-9 px-3 text-xs" onClick={() => cancelOrder.mutate({ id: order.id })} data-testid={`button-cancel-order-${order.id}`}>
                    Cancel
                  </Button>
                ) : (
                  <Link
                    href={`/orders/${order.id}`}
                    className="text-xs font-bold text-[hsl(var(--primary))]"
                    data-testid={`link-track-order-${order.id}`}
                  >
                    View
                  </Link>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No orders here yet"
            detail="Your next clear market day starts with a good listing or a thoughtful source."
          />
        )}
      </QueryState>
    </div>
  );
}

export function Insights() {
  const [activeTab, setActiveTab] = useState<"assistant" | "table">("assistant");
  const [commodity, setCommodity] = useState("");
  const [searchCommodity, setSearchCommodity] = useState("");
  const [variety, setVariety] = useState("");
  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");
  const [market, setMarket] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchCommodity(commodity.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [commodity]);
  const query = useQuery({
    queryKey: ["market-prices", searchCommodity, variety, state, district, market, dateFrom, dateTo],
    queryFn: ({ signal }) => getMarketPrices({ commodity: searchCommodity, variety, state, district, market, date_from: dateFrom, date_to: dateTo, limit: 50 }, { signal }),
    staleTime: 120_000,
  });
  const records = query.data?.records ?? [];
  const varieties = [...new Set(records.map((record) => record.variety).filter((value): value is string => Boolean(value)))];
  const states = [...new Set(records.map((record) => record.state).filter((value): value is string => Boolean(value)))];
  const districts = [...new Set(records.map((record) => record.district).filter((value): value is string => Boolean(value)))];
  const markets = [...new Set(records.map((record) => record.market).filter((value): value is string => Boolean(value)))];
  const formatPrice = (value: number | null) => value === null ? "—" : `₹${value.toLocaleString("en-IN")}`;
  const formatDate = (value: string | null) => value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Date unavailable";
  const lastUpdated = query.data?.fetched_at ? new Date(query.data.fetched_at).toLocaleString("en-IN") : null;
  const source = query.data?.source ?? "Government of India - data.gov.in";
  const errorText = query.error instanceof Error ? query.error.message : "Market data request failed.";
  const marketError = /not configured/i.test(errorText)
    ? "Configuration missing"
    : /401|403|unauthori[sz]ed|rejected/i.test(errorText)
      ? "Government API unauthorized"
      : /429|rate limit/i.test(errorText)
        ? "Government API rate limited"
        : /timed out|timeout/i.test(errorText)
          ? "Request timeout"
          : /unavailable|5\d\d/i.test(errorText)
            ? "Government API unavailable"
            : "Backend unavailable";
  return (
    <div className="space-y-7">
      <SectionTitle
        eyebrow="Market intelligence"
        title="Market intelligence & price assistance"
        detail="Analyze official market reference rates and decision support before you sell or buy."
        action={
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-1">
              <button
                type="button"
                onClick={() => setActiveTab("assistant")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  activeTab === "assistant"
                    ? "bg-[#163625] text-white shadow-xs"
                    : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                }`}
              >
                <Scale size={14} /> Price Assistant
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("table")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  activeTab === "table"
                    ? "bg-[#163625] text-white shadow-xs"
                    : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                }`}
              >
                <BarChart3 size={14} /> Mandi Records
              </button>
            </div>
            {activeTab === "table" && (
              <Button variant="secondary" onClick={() => void query.refetch()} disabled={query.isFetching}>
                <TrendingUp size={15} /> {query.isFetching ? "Refreshing..." : "Refresh"}
              </Button>
            )}
          </div>
        }
      />

      {activeTab === "assistant" ? (
        <MarketPriceAssistant />
      ) : (
        <>
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-semibold">Crop / commodity<input value={commodity} onChange={(event) => setCommodity(event.target.value)} placeholder="Potato, Tomato, Onion" className="mt-2 h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-transparent px-3 text-sm" /></label>
          <label className="text-xs font-semibold">Variety<select value={variety} onChange={(event) => setVariety(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm"><option value="">All varieties</option>{varieties.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="text-xs font-semibold">State<select value={state} onChange={(event) => setState(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm"><option value="">All states</option>{states.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="text-xs font-semibold">District<select value={district} onChange={(event) => setDistrict(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm"><option value="">All districts</option>{districts.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="text-xs font-semibold">Mandi / market<select value={market} onChange={(event) => setMarket(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm"><option value="">All markets</option>{markets.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="text-xs font-semibold">From date<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-transparent px-3 text-sm" /></label>
          <label className="text-xs font-semibold">To date<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-transparent px-3 text-sm" /></label>
          <div className="flex items-end"><Button variant="secondary" className="w-full" onClick={() => { setCommodity(""); setSearchCommodity(""); setVariety(""); setState(""); setDistrict(""); setMarket(""); setDateFrom(""); setDateTo(""); }}>Clear filters</Button></div>
        </div>
      </div>
      {query.isLoading && <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Loading government market records...</div>}
      {query.data?.stale && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Showing the latest successfully synchronized government market data while the backend refreshes it.</div>}
      {query.error && <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"><strong>{marketError}</strong><span className="ml-2">Government market data is temporarily unavailable. Marketplace listings remain available.</span></div>}
      {!query.isLoading && !query.error && records.length === 0 && <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">No government market data is available for this selection.</div>}
      {records.length > 0 && <div className="overflow-x-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="flex min-w-[680px] items-center justify-between border-b border-[hsl(var(--border))] p-5"><div><h2 className="font-display text-2xl font-bold">Current mandi reference</h2><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Source: {source} · Last updated: {lastUpdated}</p></div><span className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">Indicative government reference</span></div>
        <table className="min-w-[760px] w-full text-left text-sm"><thead className="bg-[hsl(var(--muted))] text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]"><tr><th className="p-4">Commodity / variety</th><th className="p-4">Mandi</th><th className="p-4">Grade</th><th className="p-4">Market date</th><th className="p-4">Minimum</th><th className="p-4">Maximum</th><th className="p-4">Modal</th></tr></thead><tbody className="divide-y divide-[hsl(var(--border))]">{records.map((record: MarketPriceRecord, index) => <tr key={`${record.commodity}-${record.variety}-${record.market}-${record.arrival_date}-${index}`}><td className="p-4"><div className="font-semibold">{record.commodity}</div><div className="text-xs text-[hsl(var(--muted-foreground))]">{displayVariety(record.commodity, record.variety)}</div></td><td className="p-4">{record.market ?? "Market unavailable"}<div className="text-xs text-[hsl(var(--muted-foreground))]">{record.district ?? record.state ?? "Location unavailable"}</div></td><td className="p-4">{record.grade ?? "Not specified"}</td><td className="p-4">{formatDate(record.arrival_date)}</td><td className="p-4 font-mono-ui">{formatPrice(record.min_price)}</td><td className="p-4 font-mono-ui">{formatPrice(record.max_price)}</td><td className="p-4 font-mono-ui font-bold">{formatPrice(record.modal_price)}<div className="text-[10px] font-normal text-[hsl(var(--muted-foreground))]">{record.unit ?? "Official unit unavailable"}</div></td></tr>)}</tbody></table>
      </div>}
      <p className="text-xs leading-5 text-[hsl(var(--muted-foreground))]">Market prices are sourced from the Government of India's data.gov.in platform. Prices are indicative and may differ from the actual negotiated price at a particular mandi.</p>
        </>
      )}
    </div>
  );
}

export function Logistics() {
  const orders = useListFarmerOrders();
  const plan = useCreateLogisticsPlan();
  const [destination, setDestination] = useState("Mumbai, Maharashtra");
  const [feedback, setFeedback] = useState("");
  const [result, setResult] = useState<{
    distance: number;
    estimatedDays: number;
    estimatedCost: number;
    co2Saved: number;
    stops: number;
    route: { label: string; location: string; status: string }[];
  } | null>(null);
  const list = orders.data ?? [];
  const runPlan = () =>
    plan.mutate(
      { data: { orderIds: list.map((order) => order.id), destination } },
      {
        onSuccess: (data) => {
          setResult(data);
          setFeedback("Route planned from your selected orders.");
        },
        onError: () => {
          setResult({
            distance: 472,
            estimatedDays: 2,
            estimatedCost: 6840,
            co2Saved: 38,
            stops: 3,
            route: [
              {
                label: "Pickup",
                location: "Nashik, Maharashtra",
                status: "ready",
              },
              {
                label: "Consolidate",
                location: "Pune, Maharashtra",
                status: "next",
              },
              { label: "Deliver", location: destination, status: "planned" },
            ],
          });
          setFeedback(
            "Demo route ready. It will sync once logistics is online.",
          );
        },
      },
    );
  const view = result ?? {
    distance: 472,
    estimatedDays: 2,
    estimatedCost: 6840,
    co2Saved: 38,
    stops: 3,
    route: [
      { label: "Pickup", location: "Nashik, Maharashtra", status: "ready" },
      { label: "Consolidate", location: "Pune, Maharashtra", status: "next" },
      { label: "Deliver", location: destination, status: "planned" },
    ],
  };
  return (
    <div className="space-y-7">
      <SectionTitle
        eyebrow="Logistics desk"
        title="Move more. Waste less."
        detail="Build a route that protects your margin and your harvest."
        action={<Badge tone="green">Route optimizer ready</Badge>}
      />
      <div className="grid gap-5 lg:grid-cols-[.78fr_1.22fr]">
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
          <div className="font-mono-ui text-[10px] font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">
            New plan
          </div>
          <h2 className="mt-2 font-display text-2xl font-bold">
            Plan a delivery run
          </h2>
          <p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
            We will consolidate compatible orders into one route.
          </p>
          <label className="mt-7 block text-sm font-semibold">
            Destination
            <select
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="mt-2 min-h-12 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 font-normal outline-none"
              data-testid="select-logistics-destination"
            >
              <option>Mumbai, Maharashtra</option>
              <option>Bengaluru, Karnataka</option>
              <option>Delhi, NCR</option>
              <option>Pune, Maharashtra</option>
            </select>
          </label>
          <div className="mt-5 space-y-3">
            {list.slice(0, 3).map((order) => (
              <label
                key={order.id}
                className="flex items-center gap-3 rounded-xl bg-[hsl(var(--muted))] p-3 text-sm"
              >
                <input
                  type="checkbox"
                  defaultChecked
                  className="size-4 accent-[hsl(var(--primary))]"
                  data-testid={`input-logistics-order-${order.id}`}
                />
                <span className="flex-1">
                  <strong>#{order.id}</strong> · {order.items[0]?.crop_name ?? "Order"}
                </span>
                <span className="font-mono-ui text-xs">
                  {order.items[0]?.quantity ?? 0} {order.items[0]?.unit ?? ""}
                </span>
              </label>
            ))}
          </div>
          <LoadingButton
            pending={plan.isPending}
            onClick={runPlan}
            className="mt-6 w-full"
            data-testid="button-plan-route"
          >
            Optimize this route <Route size={16} />
          </LoadingButton>
          {feedback && (
            <div className="mt-3">
              <Feedback message={feedback} kind="success" />
            </div>
          )}
        </div>
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <StatCard
              label="Route distance"
              value={`${view.distance} km`}
              detail="via NH60"
              icon={<Route size={17} />}
            />
            <StatCard
              label="Est. journey"
              value={`${view.estimatedDays} days`}
              detail="Pickup tomorrow"
              icon={<Clock3 size={17} />}
            />
            <StatCard
              label="Route cost"
              value={money(view.estimatedCost)}
              detail="₹2.85 / kg"
              icon={<CircleDollarSign size={17} />}
            />
            <StatCard
              label="CO₂ saved"
              value={`${view.co2Saved} kg`}
              detail="vs separate trips"
              icon={<Leaf size={17} />}
            />
          </div>
          <div className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono-ui text-[10px] font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">
                  Route view
                </div>
                <h2 className="mt-1 font-display text-2xl font-bold">
                  {view.stops} stops, one good run.
                </h2>
              </div>
              <div className="rounded-xl bg-[hsl(var(--muted))] p-3">
                <MapPin size={19} className="text-[hsl(var(--primary))]" />
              </div>
            </div>
            <div className="relative mt-7 space-y-1">
              {view.route.map((stop, i) => (
                <div
                  key={stop.label}
                  className="relative flex gap-4 pb-5 last:pb-0"
                >
                  <div className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--accent))] text-xs font-bold">
                    {i + 1}
                  </div>
                  {i < view.route.length - 1 && (
                    <div className="absolute left-[15px] top-8 h-full border-l border-dashed border-[hsl(var(--accent))]" />
                  )}
                  <div>
                    <div className="text-sm font-bold">{stop.label}</div>
                    <div className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                      {stop.location}
                    </div>
                  </div>
                  <Badge tone={i === 0 ? "green" : "neutral"}>
                    {stop.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
