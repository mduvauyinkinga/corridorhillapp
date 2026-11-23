/**
 * screens/auth/ResetPasswordScreen.js
 * ------------------------------------------------------------------
 * Port of reset-password.html + js/reset-password.js:
 *   - reads the oobCode from navigation params,
 *   - verifies the code with verifyPasswordResetCode(),
 *   - confirms the new password with confirmPasswordReset().
 *
 * On mobile, the oobCode is passed via navigation params instead of
 * the URL query string (Expo handles deep-linking separately).
 */

import React, { useEffect, useState } from "react";
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
import {
  confirmPasswordReset,
  verifyPasswordResetCode,
} from "firebase/auth";
import { auth } from "../../config/firebase";
import { colors, spacing, typography } from "../../theme";
import { getFirebaseErrorMessage } from "../../utils/errors";

export default function ResetPasswordScreen({ route, navigation }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState("");
  const [done, setDone] = useState(false);

  const oobCode = route.params?.oobCode || "";

  useEffect(() => {
    if (!oobCode) {
      setFormError(
        "No reset code in the link. Please request a new reset link from the login page."
      );
    }
  }, [oobCode]);

  const handleSubmit = async () => {
    setFormError("");

    if (!password || password.length < 6) {
      setErrors({ password: "Password must be at least 6 characters." });
      return;
    } else {
      setErrors({ password: null });
    }

    if (!confirmPassword) {
      setErrors({ confirmPassword: "Please confirm your password." });
      return;
    } else if (confirmPassword !== password) {
      setErrors({ confirmPassword: "Passwords do not match." });
      return;
    } else {
      setErrors({ confirmPassword: null });
    }

    setSubmitting(true);
    try {
      await verifyPasswordResetCode(auth, oobCode);
      await confirmPasswordReset(auth, oobCode, password);
      setDone(true);
    } catch (error) {
      console.error("[ResetPasswordScreen] failed:", error);
      const code = error.code || "";
      let message = "Something went wrong. Please try again.";
      if (code === "auth/expired-action-code") {
        message = "This reset link has expired. Please request a new one.";
      } else if (code === "auth/invalid-action-code") {
        message = "This reset link is invalid. Please request a new one.";
      } else if (code === "auth/weak-password") {
        message = "Password must be at least 6 characters.";
      }
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <KeyboardAvoidingView
        style={styles.page}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <SectionTitle>Password reset</SectionTitle>
          <Card>
            <FormAlert message="Your new password is now active. You can sign in." />
            <View style={styles.switchRow}>
              <Text style={styles.switchText}>
                Go to <Text style={styles.link} onPress={() => navigation.navigate("Login")}>sign in</Text>
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
        <SectionTitle>Set a new password</SectionTitle>
        <Text style={styles.subtitle}>
          Choose a new password for your account.
        </Text>

        <Card>
          <FormAlert message={formError} />

          <TextField
            label="New Password"
            required
            value={password}
            onChangeText={setPassword}
            error={errors.password}
            placeholder="At least 6 characters"
            secureTextEntry
            autoCapitalize="none"
          />

          <TextField
            label="Confirm Password"
            required
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            error={errors.confirmPassword}
            placeholder="Re-enter your password"
            secureTextEntry
            autoCapitalize="none"
            onSubmitEditing={handleSubmit}
          />

          <Button
            title="Reset Password"
            onPress={handleSubmit}
            loading={submitting}
            loadingText="Resetting…"
            fullWidth
          />

          <View style={styles.switchRow}>
            <Text style={styles.switchText}>
              Remember your password? <Text style={styles.link} onPress={() => navigation.navigate("Login")}>Go to sign in</Text>
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