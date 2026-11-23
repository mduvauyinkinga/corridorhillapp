/**
 * screens/auth/ForgotPasswordScreen.js
 * ------------------------------------------------------------------
 * Port of forgot-password.html + js/forgot-password.js:
 *   - validates email,
 *   - calls Firebase's sendPasswordResetEmail(),
 *   - shows generic success message (anti-enumeration).
 */

import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import Button from "../../components/Button";
import { Card, SectionTitle } from "../../components/Layout";
import { FormAlert } from "../../components/States";
import TextField from "../../components/TextField";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../config/firebase";
import { useAuth } from "../../context/AuthContext";
import { colors, spacing, typography } from "../../theme";
import { getFirebaseErrorMessage } from "../../utils/errors";
import { validateRequired } from "../../utils/validation";

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    setFormError("");
    const validation = validateRequiredField(email);
    if (validation) {
      setErrors({ email: validation });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrors({ email: "Please enter a valid email address." });
      return;
    }

    setSubmitting(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSent(true);
    } catch (error) {
      console.error("[ForgotPasswordScreen] failed:", error);
      const code = error.code || "";
      let message = "Something went wrong. Please try again.";
      if (code === "auth/invalid-email") {
        message = "Please enter a valid email address.";
      } else if (code === "auth/too-many-requests") {
        message = "Too many attempts. Please try again later.";
      } else if (code === "auth/missing-email") {
        message = "Email is required.";
      }
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const validateRequiredField = (value) => {
    if (!value || !value.trim()) return "Email is required.";
    return null;
  };

  if (sent) {
    return (
      <KeyboardAvoidingView
        style={styles.page}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <SectionTitle>Reset link sent</SectionTitle>
          <Card>
            <FormAlert
              message={`If an account exists for ${email}, a password-reset link has been sent to that email. It expires in 1 hour.`}
            />
            <View style={styles.switchRow}>
              <Text style={styles.switchText}>
                Remember your password?{" "}
                <Text style={styles.link} onPress={() => navigation.goBack()}>
                  Sign in
                </Text>
              </Text>
            </View>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SectionTitle>Forgot password</SectionTitle>
        <Text style={styles.subtitle}>
          Enter your email and we&apos;ll send a reset link.
        </Text>

        <Card>
          <FormAlert message={formError} />

          <TextField
            label="Email"
            required
            value={email}
            onChangeText={setEmail}
            error={errors.email}
            placeholder="you@tut4life.ac.za"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />

          <Button
            title="Send Reset Link"
            onPress={handleSubmit}
            loading={submitting}
            loadingText="Sending…"
            fullWidth
          />

          <View style={styles.switchRow}>
            <Text style={styles.switchText}>
              Remember your password? <Text style={styles.link} onPress={() => navigation.goBack()}>Sign in</Text>
            </Text>
          </View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  subtitle: { color: colors.textMuted, marginBottom: spacing.lg },
  switchRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.lg,
    flexWrap: "wrap",
  },
  switchText: { color: colors.textMuted, fontSize: typography.small },
  link: { color: colors.primary, fontWeight: "700", fontSize: typography.small },
});