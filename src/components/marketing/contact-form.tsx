"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, CheckCircle2, AlertCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const contactSchema = z.object({
  name: z
    .string()
    .min(2, "Indtast dit navn (min. 2 tegn)")
    .max(100, "Navn er for langt"),
  email: z
    .string()
    .min(1, "Indtast din e-mailadresse")
    .email("Indtast en gyldig e-mailadresse"),
  company: z.string().max(200, "Virksomhedsnavn er for langt").optional(),
  subject: z
    .string()
    .min(3, "Indtast et emne (min. 3 tegn)")
    .max(200, "Emne er for langt"),
  message: z
    .string()
    .min(10, "Beskeden skal være mindst 10 tegn")
    .max(5000, "Beskeden er for lang (max 5000 tegn)"),
});

type ContactFormData = z.infer<typeof contactSchema>;

type SubmitState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success" }
  | { status: "error"; message: string };

/**
 * Contact form for the public /contact page.
 *
 * Client component — manages form state, validation (zod + react-hook-form),
 * and submission to /api/contact. Shows success/error states inline.
 */
export function ContactForm() {
  const [submitState, setSubmitState] = useState<SubmitState>({
    status: "idle",
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      email: "",
      company: "",
      subject: "",
      message: "",
    },
  });

  const onSubmit = async (data: ContactFormData) => {
    setSubmitState({ status: "loading" });
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body?.error || "Noget gik galt. Prøv igen eller skriv til info@alphaflow.dk"
        );
      }

      setSubmitState({ status: "success" });
      reset();
    } catch (err) {
      setSubmitState({
        status: "error",
        message:
          err instanceof Error
            ? err.message
            : "Noget gik galt. Prøv igen senere.",
      });
    }
  };

  // ─── Success state ───
  if (submitState.status === "success") {
    return (
      <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-[#ccfbef] shadow-sm p-8 text-center">
        <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-[#f0fdf9] border border-[#ccfbef] mx-auto mb-4">
          <CheckCircle2 className="h-7 w-7 text-[#0d9488]" />
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">
          Tak for din besked!
        </h3>
        <p className="text-[14px] text-gray-600 leading-relaxed max-w-md mx-auto">
          Vi har modtaget din henvendelse og vender tilbage inden for én
          hverdag på den oplyste e-mailadresse.
        </p>
        <Button
          variant="outline"
          className="mt-6 h-10 border-[#0d9488]/30 text-[#0d9488] hover:bg-[#f0fdf9] hover:text-[#0f766e]"
          onClick={() => setSubmitState({ status: "idle" })}
        >
          Send en ny besked
        </Button>
      </div>
    );
  }

  // ─── Form ───
  const isLoading = submitState.status === "loading";

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="rounded-2xl bg-white/80 backdrop-blur-sm border border-[#e2e8e6]/80 shadow-sm p-6 sm:p-8"
      noValidate
    >
      {/* Error banner */}
      {submitState.status === "error" && (
        <div className="mb-5 flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 p-4">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-medium text-red-900">
              Der opstod en fejl
            </p>
            <p className="text-[12px] text-red-700 mt-0.5">
              {submitState.message}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
        {/* Name */}
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-[13px] font-medium text-gray-700">
            Navn <span className="text-red-500">*</span>
          </Label>
          <Input
            id="name"
            type="text"
            autoComplete="name"
            placeholder="Dit fulde navn"
            className="h-10 bg-white"
            disabled={isLoading}
            {...register("name")}
            aria-invalid={!!errors.name}
          />
          {errors.name && (
            <p className="text-[12px] text-red-500">{errors.name.message}</p>
          )}
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <Label
            htmlFor="email"
            className="text-[13px] font-medium text-gray-700"
          >
            E-mail <span className="text-red-500">*</span>
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="navn@virksomhed.dk"
            className="h-10 bg-white"
            disabled={isLoading}
            {...register("email")}
            aria-invalid={!!errors.email}
          />
          {errors.email && (
            <p className="text-[12px] text-red-500">{errors.email.message}</p>
          )}
        </div>

        {/* Company */}
        <div className="space-y-1.5 sm:col-span-2">
          <Label
            htmlFor="company"
            className="text-[13px] font-medium text-gray-700"
          >
            Virksomhed <span className="text-gray-400">(valgfrit)</span>
          </Label>
          <Input
            id="company"
            type="text"
            autoComplete="organization"
            placeholder="Virksomhedens navn"
            className="h-10 bg-white"
            disabled={isLoading}
            {...register("company")}
          />
        </div>

        {/* Subject */}
        <div className="space-y-1.5 sm:col-span-2">
          <Label
            htmlFor="subject"
            className="text-[13px] font-medium text-gray-700"
          >
            Emne <span className="text-red-500">*</span>
          </Label>
          <Input
            id="subject"
            type="text"
            placeholder="Hvad drejer henvendelsen sig om?"
            className="h-10 bg-white"
            disabled={isLoading}
            {...register("subject")}
            aria-invalid={!!errors.subject}
          />
          {errors.subject && (
            <p className="text-[12px] text-red-500">
              {errors.subject.message}
            </p>
          )}
        </div>

        {/* Message */}
        <div className="space-y-1.5 sm:col-span-2">
          <Label
            htmlFor="message"
            className="text-[13px] font-medium text-gray-700"
          >
            Besked <span className="text-red-500">*</span>
          </Label>
          <Textarea
            id="message"
            rows={6}
            placeholder="Beskriv din henvendelse..."
            className="bg-white resize-y min-h-[120px]"
            disabled={isLoading}
            {...register("message")}
            aria-invalid={!!errors.message}
          />
          {errors.message && (
            <p className="text-[12px] text-red-500">
              {errors.message.message}
            </p>
          )}
        </div>
      </div>

      {/* Submit */}
      <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-[12px] text-gray-400 text-center sm:text-left">
          Vi behandler dine oplysninger fortroligt og svarer inden for én
          hverdag.
        </p>
        <Button
          type="submit"
          disabled={isLoading}
          className="w-full sm:w-auto h-10 px-6 text-[14px]"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sender...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Send besked
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
