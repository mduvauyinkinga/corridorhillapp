/**
 * screens/resident/SubmitComplaintScreen.js
 * ------------------------------------------------------------------
 * Port of complaint.html + js/complaints.js.
 *
 * Behaviour reproduced exactly:
 *   - a resident must have a room (roomId + unitId) before submitting,
 *   - the room preview is loaded from rooms/{roomId} and units/{unitId}
 *     (block, room number, unit letter),
 *   - a category AND at least one issue are required,
 *   - photos are validated (jpg/jpeg/png/webp, <= 5 MB) and uploaded to the
 *     same Storage path the website uses, with a progress indicator,
 *   - the complaint is written with status "Submitted", priority "Low",
 *     photoURLs, notes, createdAt/updatedAt server timestamps,
 *   - the initial "Complaint Submitted" timeline event is recorded,
 *   - on success the resident lands on their complaint list.
 */

import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useEffect, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import Button from "../../components/Button";
import CheckboxGroup from "../../components/CheckboxGroup";
import { Card, ScreenTitle } from "../../components/Layout";
import OptionPicker from "../../components/OptionPicker";
import RoomSummary from "../../components/RoomSummary";
import { FormAlert } from "../../components/States";
import TextField from "../../components/TextField";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { createComplaint } from "../../services/complaintService";
import { fetchRoom, fetchUnit } from "../../services/roomService";
import { uploadComplaintPhoto } from "../../services/storageService";
import { colors, radius, spacing, typography } from "../../theme";
import { COMPLAINT_CATEGORIES, COMPLAINT_ISSUES } from "../../utils/complaints";
import { getFirebaseErrorMessage } from "../../utils/errors";
import { validateComplaint, validateImageAsset } from "../../utils/validation";
import { fetchRecentIssues } from "../../services/complaintService";

export default function SubmitComplaintScreen({ navigation }) {
  const { profile, uid } = useAuth();
  const { showToast } = useToast();

  const [category, setCategory] = useState("");
  const [issues, setIssues] = useState([]);
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState([]);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [progress, setProgress] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [isRoomLoading, setIsRoomLoading] = useState(true);
  const [recentIssues, setRecentIssues] = useState([]);
  const [recentIssuesLoading, setRecentIssuesLoading] = useState(false);
  const [roomPreview, setRoomPreview] = useState({
    block: null,
    roomNumber: null,
    unitLetter: null,
  });

  const hasRoom = Boolean(profile?.roomId && profile?.unitId);

  const categoryOptions = COMPLAINT_CATEGORIES.map((item) => ({ value: item, label: item }));

  /* Room preview (rooms/{roomId} + units/{unitId}) — js/complaints.js init. */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsRoomLoading(true);
      if (!profile?.roomId || !profile?.unitId) {
        setRoomPreview({
          block: null,
          roomNumber: null,
          unitLetter: null,
        });
        setIsRoomLoading(false);
        return;
      }
      try {
        const [room, unit] = await Promise.all([
          fetchRoom(profile.roomId),
          fetchUnit(profile.unitId),
        ]);
        if (cancelled) return;
        setRoomPreview({
          block: room?.block || "—",
          roomNumber: room?.roomNumber ?? "—",
          unitLetter: unit?.unitName || "—",
        });
      } catch (error) {
        console.error("[SubmitComplaintScreen] load room summary error:", error);
        if (!cancelled) setFormError("Could not load your room details. Please try again.");
      } finally {
        setIsRoomLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [profile?.roomId, profile?.unitId]);

  const toggleIssue = useCallback((issue) => {
    setIssues((current) =>
      current.includes(issue) ? current.filter((item) => item !== issue) : [...current, issue]
    );
  }, []);

  /** Pick photos with the same accepted types as the web file input. */
  const pickPhotos = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setFormError("Photo access is needed to attach pictures of the issue.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        quality: 0.8,
      });
      if (result.canceled) return;

      const picked = result.assets || [];
      const invalid = picked.find((asset) => validateImageAsset(asset));
      if (invalid) {
        setFormError(validateImageAsset(invalid));
        return;
      }
      setFormError("");
      setPhotos((current) => [...current, ...picked]);
    } catch (error) {
      console.error("[SubmitComplaintScreen] photo picker error:", error);
      setFormError(getFirebaseErrorMessage(error));
    }
  };

  const removePhoto = (uri) => setPhotos((current) => current.filter((asset) => asset.uri !== uri));

  /** Submit: upload photos first, then write the complaint + timeline event. */
  const handleSubmit = async () => {
    setFormError("");
    const validation = validateComplaint({ category, issues });
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    const invalidPhoto = photos.find((asset) => validateImageAsset(asset));
    if (invalidPhoto) {
      setFormError(validateImageAsset(invalidPhoto));
      return;
    }

    if (!uid || !hasRoom) {
      setFormError("You must choose a room before submitting a complaint.");
      return;
    }

    setSubmitting(true);
    try {
      const photoURLs = [];
      if (photos.length > 0) {
        for (let index = 0; index < photos.length; index += 1) {
          const asset = photos[index];
          setProgress(`Uploading photo ${index + 1} of ${photos.length}… 0%`);
          const url = await uploadComplaintPhoto(asset, uid, (percent) => {
            setProgress(`Uploading photo ${index + 1} of ${photos.length}… ${percent}%`);
          });
          photoURLs.push(url);
        }
      }

      await createComplaint({
        uid,
        profile,
        category,
        issues,
        notes: notes.trim(),
        photoURLs,
      });

      showToast("Complaint submitted successfully!", "success");
      setCategory("");
      setIssues([]);
      setNotes("");
      setPhotos([]);
      navigation.navigate("Reports");
    } catch (error) {
      console.error("[SubmitComplaintScreen] submit error:", error);
      setFormError(getFirebaseErrorMessage(error));
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  };

  if (!hasRoom) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenTitle title="Submit a Complaint" />
        <FormAlert message="You must choose a room before submitting a complaint." />
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle
          title="Submit a Complaint"
          subtitle="Report one or more maintenance issues in your room."
        />

        <RoomSummary
          block={roomPreview.block}
          roomNumber={roomPreview.roomNumber}
          roomLetter={roomPreview.unitLetter}
        />

        <Card>
          <FormAlert message={formError} />

          <OptionPicker
            label="Category"
            required
            value={category}
            options={categoryOptions}
            onChange={setCategory}
            error={errors.category}
            placeholder="Select a category…"
            modalTitle="Choose a category"
          />

          <CheckboxGroup
            label="Select issue(s)"
            required
            options={COMPLAINT_ISSUES}
            values={issues}
            onToggle={toggleIssue}
            error={errors.issues}
          />

          <Text style={styles.label}>Photo attachments</Text>
          <Text style={styles.hint}>
            JPG, JPEG, PNG or WEBP. Each image must be 5 MB or smaller.
          </Text>
          <Button
            title={photos.length ? `Add more photos (${photos.length})` : "Add photos"}
            variant="ghost"
            onPress={pickPhotos}
            style={styles.photoButton}
          />
          {photos.length > 0 ? (
            <View style={styles.previews}>
              {photos.map((asset) => (
                <Pressable
                  key={asset.uri}
                  onPress={() => removePhoto(asset.uri)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${asset.fileName || "photo"}`}
                >
                  <Image source={{ uri: asset.uri }} style={styles.preview} />
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {progress ? <Text style={styles.progress}>{progress}</Text> : null}

          <TextField
            label="Additional notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Provide any extra details about the issue(s)…"
            multiline
            numberOfLines={4}
          />

          <Button
            title="Submit Complaint"
            fullWidth
            loading={submitting}
            loadingText="Submitting…"
            onPress={handleSubmit}
          />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  label: {
    fontSize: typography.small,
    fontWeight: "600",
    color: colors.text,
    marginBottom: spacing.xs,
  },
  hint: { color: colors.textMuted, fontSize: typography.small },
  photoButton: { marginTop: spacing.sm, marginBottom: spacing.md },
  previews: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginBottom: spacing.md },
  preview: {
    width: 84,
    height: 84,
    borderRadius: radius.sm,
    backgroundColor: colors.border,
  },
  removeText: {
    textAlign: "center",
    color: colors.danger,
    fontSize: typography.tiny,
    marginTop: 2,
  },
  progress: { color: colors.info, fontSize: typography.small, marginBottom: spacing.md },
});
