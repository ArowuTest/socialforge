"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuthStore } from "@/lib/stores/auth";
import { authApi } from "@/lib/api";
import { setTokens } from "@/lib/api";
import { cn } from "@/lib/utils";

const signupSchema = z.object({
  name: z.string().min(2, "Full name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  workspaceName: z
    .string()
    .min(2, "Workspace name must be at least 2 characters"),
});

type SignupFormValues = z.infer<typeof signupSchema>;

function getPasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
} {
  if (!password) return { score: 0, label: "", color: "" };

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) return { score, label: "Weak", color: "bg-red-500" };
  if (score <= 3) return { score, label: "Medium", color: "bg-yellow-500" };
  return { score, label: "Strong", color: "bg-green-500" };
}

function SignupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite") ?? "";
  const { setTokensAndUser } = useAuthStore();
  const [showPassword, setShowPassword] = React.useState(false);
  const [passwordValue, setPasswordValue] = React.useState("");

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      workspaceName: "",
    },
  });

  // Watch password for strength indicator
  const watchedPassword = watch("password");
  React.useEffect(() => {
    setPasswordValue(watchedPassword || "");
  }, [watchedPassword]);

  const strength = getPasswordStrength(passwordValue);

  const onSubmit = async (data: SignupFormValues) => {
    try {
      const res = await authApi.register({
        name: data.name,
        email: data.email,
        password: data.password,
        workspaceName: data.workspaceName,
      });
      // Backend returns access_token / refresh_token (snake_case)
      const d = res.data as unknown as {
        access_token: string; refresh_token: string; expires_at: string;
        user: import("@/types").User; workspace: import("@/types").Workspace;
      };
      setTokensAndUser(
        { accessToken: d.access_token, refreshToken: d.refresh_token, expiresIn: new Date(d.expires_at).getTime() - Date.now() },
        d.user,
        d.workspace,
      );

      // If the user arrived from an invite link, redeem the token now that
      // they're authenticated. Failures are non-fatal — they can still use
      // their newly-created workspace.
      if (inviteToken) {
        try {
          await authApi.acceptInvite(inviteToken);
          toast.success("Account created and workspace joined!");
        } catch (err) {
          const msg = err instanceof Error ? err.message : "invite could not be accepted";
          toast.warning(`Account created, but ${msg}`);
        }
      } else {
        toast.success("Account created! Welcome to ChiselPost.");
      }
      router.push("/calendar");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create account. Please try again.";
      toast.error(message);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <Card className="shadow-xl border-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
        <CardHeader className="space-y-1 pb-4">
          <div className="flex justify-center mb-2">
            <div className="h-12 w-12 rounded-xl bg-violet-600 flex items-center justify-center shadow-lg">
              <Zap className="h-6 w-6 text-white fill-white" />
            </div>
          </div>
          <CardTitle className="text-2xl text-center font-bold tracking-tight">
            Create your account
          </CardTitle>
          <CardDescription className="text-center text-base">
            Start your 14-day free trial — no credit card required
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Full Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                placeholder="Jane Smith"
                autoComplete="name"
                autoFocus
                {...register("name")}
                className={errors.name ? "border-red-500 focus-visible:ring-red-500" : ""}
              />
              {errors.name && (
                <p className="text-xs text-red-500">{errors.name.message}</p>
              )}
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                autoComplete="email"
                {...register("email")}
                className={errors.email ? "border-red-500 focus-visible:ring-red-500" : ""}
              />
              {errors.email && (
                <p className="text-xs text-red-500">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                  {...register("password")}
                  className={cn(
                    "pr-10",
                    errors.password ? "border-red-500 focus-visible:ring-red-500" : ""
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>

              {/* Password strength indicator */}
              {passwordValue && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className={cn(
                          "h-1.5 flex-1 rounded-full transition-all duration-300",
                          i <= strength.score
                            ? strength.color
                            : "bg-gray-200 dark:bg-gray-700"
                        )}
                      />
                    ))}
                  </div>
                  {strength.label && (
                    <p
                      className={cn(
                        "text-xs font-medium",
                        strength.score <= 2
                          ? "text-red-500"
                          : strength.score <= 3
                          ? "text-yellow-600"
                          : "text-green-600"
                      )}
                    >
                      {strength.label} password
                    </p>
                  )}
                </div>
              )}

              {errors.password && (
                <p className="text-xs text-red-500">{errors.password.message}</p>
              )}
            </div>

            {/* Workspace Name */}
            <div className="space-y-2">
              <Label htmlFor="workspaceName">Workspace name</Label>
              <Input
                id="workspaceName"
                placeholder="Acme Corp"
                {...register("workspaceName")}
                className={
                  errors.workspaceName ? "border-red-500 focus-visible:ring-red-500" : ""
                }
              />
              <p className="text-xs text-muted-foreground">
                This is the name of your team or company
              </p>
              {errors.workspaceName && (
                <p className="text-xs text-red-500">
                  {errors.workspaceName.message}
                </p>
              )}
            </div>

            {/* Terms */}
            <p className="text-xs text-muted-foreground text-center">
              By signing up, you agree to our{" "}
              <Link
                href="/terms"
                className="text-violet-600 hover:underline dark:text-violet-400"
              >
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                className="text-violet-600 hover:underline dark:text-violet-400"
              >
                Privacy Policy
              </Link>
            </p>

            {/* Submit */}
            <Button
              type="submit"
              className="w-full bg-violet-600 hover:bg-violet-700 text-white font-medium h-10"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                "Create free account"
              )}
            </Button>
          </form>

          {/* Login link */}
          <div className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 transition-colors"
            >
              Log in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SignupPage() {
  return (
    <React.Suspense fallback={<Loader2 className="mx-auto h-5 w-5 animate-spin" />}>
      <SignupContent />
    </React.Suspense>
  );
}
