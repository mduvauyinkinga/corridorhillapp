/**
 * screens/resident/EditComplaintScreen.js
 * ------------------------------------------------------------------
 * Port of the "Edit Complaint" modal in tracking.html + js/tracking.js.
 *
 * Rules preserved:
 *   - only the category, the selected issues and the notes are written
 *     (the status is untouched so the Firestore rule
 *     `request.resource.data.status == resource.data.status` still allows it),
 *   - editing is only offered while the complaint is Submitted or Received,
 *   - a "Complaint Edited" timeline event is recorded.
 */

import React, { useCallback, useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from "react-native";

import Button from "../../components/Button";
import CheckboxGroup from "../../components/CheckboxGroup";
import { Card, ScreenTitle } from "../../components/Layout";
import OptionPicker from "../../components/OptionPicker";
import { ErrorNotice, FormAlert, LoadingState } from "../../components/States";
import TextField from "../../components/TextField";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import {
  fetchComplaint,
  updateComplaintDetails,
} from "../../services/complaintService";
import { colors, spacing } from "../../theme";
import { COMPLAINT_CATEGORIES, COMPLAINT_ISSUES, isEditableStatus } from "../../utils/complaints";
import { getFirebaseErrorMessage } from "../../utils/errors";
import { validateComplaint } from "../../utils/validation";

export default function EditComplaintScreen({ navigation, route }) {
  const complaintId = route?.params?.complaintId;
  const { profile, uid } = useAuth();
  const { showToast } = useToast();

  const [category, setCategory] = useState("");
  const [issues, setIssues] = useState([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");

  const categoryOptions = COMPLAINT_CATEGORIES.map((item) => ({ value: item, label: item }));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const complaint = await fetchComplaint(complaintId);
        if (cancelled || !complaint) return;
        setCategory(complaint.category || "");
        setIssues(Array.isArray(complaint.issues) ? complaint.issues : []);
        setNotes(complaint.notes || "");
        if (!isEditableStatus(complaint.status)) {
          setError("This complaint can no longer be edited.");
        }
      } catch (loadError) {
        console.error("[EditComplaintScreen] load error:", loadError);
        if (!cancelled) setError(getFirebaseErrorMessage(loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [complaintId]);

  const toggleIssue = useCallback((issue) => {
    setIssues((current) =>
      current.includes(issue) ? current.filter((item) => item !== issue) : [...current, issue]
    );
  }, []);

  const handleSave = async () => {
    setError("");
    const validation = validateComplaint({ category, issues });
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSaving(true);
    try {
      await updateComplaintDetails(complaintId, {
        category,
        issues,
        notes: notes.trim(),
        authorId: uid,
        authorName: profile?.name || "Resident",
      });
      showToast("Complaint updated successfully!", "success");
      navigation.goBack();
    } catch (saveError) {
      console.error("[EditComplaintScreen] save error:", saveError);
      setError(getFirebaseErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState message="Loading complaint…" />;

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="Edit complaint" subtitle="Update the category, issues or notes." />
        <ErrorNotice message={error} />
        <FormAlert message="" />
        <Card>
          <OptionPicker
            label="Category"
            required
            value={category}
            options={categoryOptions}
            onChange={setCategory}
            error={errors.category}
            placeholder="Select a category…"
          />
          <CheckboxGroup
            label="Select issue(s)"
            required
            options={COMPLAINT_ISSUES}
            values={issues}
            onToggle={toggleIssue}
            error={errors.issues}
          />
          <TextField
            label="Additional notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Provide any extra details about the issue(s)…"
            multiline
            numberOfLines={4}
          />
          <Button
            title="Save Changes"
            fullWidth
            loading={saving}
            loadingText="Saving…"
            onPress={handleSave}
          />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
});