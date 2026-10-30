/**
 * screens/resident/DashboardScreen.js
 * ------------------------------------------------------------------
 * Port of dashboard.html + js/dashboard.js for mobile.
 *
 * Reuses the website's logic exactly:
 *   - profile name for the greeting ("Hello, <first name>!"),
 *   - room summary from the denormalised profile fields, falling back to
 *     the rooms/{roomId} and units/{unitId} documents when they are missing,
 *   - ONE complaints query (residentId == uid, orderBy createdAt desc) from
 *     which all statistics and lists are derived in memory,
 *   - "Latest Maintenance Update": the newest of
 *        (a) the latest maintenance note of the newest complaint, and
 *        (b) the newest unitAnnouncement for the resident's room,
 *     labelled "Shared unit update" when the announcement wins,
 *   - house rules from the website's dashboard.
 *
 * Errors never blank the screen: each section shows its own notice, which
 * is the mobile equivalent of the website's per-section error handling.
 */

import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import Button from "../../components/Button";
import ComplaintCard from "../../components/ComplaintCard";
import { Card, ScreenTitle, SectionTitle } from "../../components/Layout";
import RoomSummary from "../../components/RoomSummary";
import StatCard from "../../components/StatCard";
import { EmptyState, ErrorNotice, LoadingState } from "../../components/States";
import { HOUSE_RULES } from "../../config/branding";
import { useAuth } from "../../context/AuthContext";
import { fetchLatestAnnouncement } from "../../services/announcementService";
import { fetchResidentComplaints } from "../../services/complaintService";
import { fetchLatestNote } from "../../services/noteService";
import { fetchRoom, fetchUnit } from "../../services/roomService";
import { colors, spacing, typography } from "../../theme";
import { isActiveStatus, normalizeStatus } from "../../utils/complaints";
import { formatDate } from "../../utils/dates";
import { getFirebaseErrorMessage } from "../../utils/errors";

export default function DashboardScreen({ navigation }) {
  const { profile, uid } = useAuth();

  const [complaints, setComplaints] = useState([]);
  const [roomInfo, setRoomInfo] = useState({ block: null, roomNumber: null, roomLetter: null });
  const [latestUpdate, setLatestUpdate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  /** Room summary with the same fallback chain as js/dashboard.js. */
  const resolveRoomInfo = useCallback(async (profileData) => {
    if (profileData.block != null && profileData.roomNumber != null && profileData.roomLetter != null) {
      return {
        block: profileData.block,
        roomNumber: profileData.roomNumber,
        roomLetter: profileData.roomLetter,
      };
    }
    try {
      const room = await fetchRoom(profileData.roomId);
      const unit = profileData.unitId ? await fetchUnit(profileData.unitId) : null;
      return {
        block: profileData.block ?? room?.block ?? null,
        roomNumber: profileData.roomNumber ?? room?.roomNumber ?? null,
        roomLetter: profileData.roomLetter ?? unit?.roomLetter ?? unit?.unitName ?? null,
      };
    } catch (fallbackError) {
      console.warn("[DashboardScreen] room fallback error:", fallbackError);
      return { block: null, roomNumber: null, roomLetter: null };
    }
  }, []);

  /** Latest maintenance update (note vs shared unit announcement). */
  const resolveLatestUpdate = useCallback(async (residentComplaints, roomId) => {
    const target = residentComplaints[0] || null;
    const [note, announcement] = await Promise.all([
      target ? fetchLatestNote(target.id) : Promise.resolve(null),
      roomId ? fetchLatestAnnouncement(roomId) : Promise.resolve(null),
    ]);

    const noteDate = note?.createdAt?.toMillis?.() || 0;
    const announcementDate = announcement?.createdAt?.toMillis?.() || 0;
    if (announcementDate > noteDate) return { ...announcement, isAnnouncement: true };
    return note;
  }, []);

  const load = useCallback(async () => {
    if (!profile || !uid) return;
    setError("");
    try {
      const [list, info] = await Promise.all([
        fetchResidentComplaints(uid),
        resolveRoomInfo(profile),
      ]);
      setComplaints(list);
      setRoomInfo(info);

      try {
        setLatestUpdate(await resolveLatestUpdate(list, profile.roomId));
      } catch (updateError) {
        console.warn("[DashboardScreen] latest update error:", updateError);
        setLatestUpdate(null);
      }
    } catch (loadError) {
      console.error("[DashboardScreen] load error:", loadError);
      setError(getFirebaseErrorMessage(loadError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile, uid, resolveRoomInfo, resolveLatestUpdate]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const active = complaints.filter((c) => isActiveStatus(c.status));
  const inProgress = complaints.filter((c) => normalizeStatus(c.status) === "In Progress");
  const completed = complaints.filter((c) => normalizeStatus(c.status) === "Completed");

  if (loading) return <LoadingState message="Loading your dashboard…" />;

  const firstName = profile?.name ? String(profile.name).split(" ")[0] : "there";

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <ScreenTitle
        title={`Hello, ${firstName}!`}
        subtitle="Here's your residence overview."
      />

      <ErrorNotice message={error} onRetry={load} />

      <View style={styles.actions}>
        <Button
          title="Submit complaint"
          fullWidth
          onPress={() => navigation.navigate("Report")}
        />
        <Button
          title="Track complaints"
          variant="ghost"
          fullWidth
          onPress={() => navigation.navigate("Reports")}
        />
      </View>

      <RoomSummary
        block={roomInfo.block}
        roomNumber={roomInfo.roomNumber}
        roomLetter={roomInfo.roomLetter}
      />

      <SectionTitle>Your complaint statistics</SectionTitle>
      <View style={styles.statsRow}>
        <StatCard label="Total" value={complaints.length} />
        <StatCard label="Active" value={active.length} />
      </View>
      <View style={styles.statsRow}>
        <StatCard label="In progress" value={inProgress.length} accent={colors.info} />
        <StatCard label="Completed" value={completed.length} accent={colors.success} />
      </View>

      <SectionTitle style={styles.sectionSpacer}>Active complaints</SectionTitle>
      {active.length === 0 ? (
        <EmptyState message="You have no active complaints. 🎉" />
      ) : (
        active.map((complaint) => (
          <ComplaintCard
            key={complaint.id}
            complaint={complaint}
            onPress={() => navigation.navigate("ComplaintDetails", { complaintId: complaint.id })}
          />
        ))
      )}

      <SectionTitle style={styles.sectionSpacer}>Latest maintenance update</SectionTitle>
      <Card>
        {latestUpdate ? (
          <>
            <Text style={styles.updateText}>
              {latestUpdate.isAnnouncement ? latestUpdate.message || "" : latestUpdate.text || ""}
            </Text>
            <Text style={styles.updateMeta}>
              {`${
                latestUpdate.isAnnouncement
                  ? "Shared unit update"
                  : latestUpdate.authorName || "Management"
              } · ${formatDate(latestUpdate.createdAt)}`}
            </Text>
          </>
        ) : (
          <Text style={styles.updateEmpty}>No maintenance updates yet.</Text>
        )}
      </Card>

      <SectionTitle style={styles.sectionSpacer}>Complaint history</SectionTitle>
      {complaints.length === 0 ? (
        <EmptyState
          message="You haven't submitted any complaints yet."
          actionLabel="Submit a complaint"
          onAction={() => navigation.navigate("Report")}
        />
      ) : (
        complaints.map((complaint) => (
          <ComplaintCard
            key={complaint.id}
            complaint={complaint}
            onPress={() => navigation.navigate("ComplaintDetails", { complaintId: complaint.id })}
          />
        ))
      )}

      <SectionTitle style={styles.sectionSpacer}>House rules</SectionTitle>
      {HOUSE_RULES.map((rule) => (
        <Card key={rule.title} style={styles.ruleCard}>
          <Text style={styles.ruleTitle}>{rule.title}</Text>
          <Text style={styles.ruleBody}>{rule.body}</Text>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  actions: { gap: spacing.md, marginBottom: spacing.lg },
  statsRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  sectionSpacer: { marginTop: spacing.xl },
  updateText: { color: colors.text, fontSize: typography.body },
  updateMeta: { marginTop: spacing.sm, color: colors.textMuted, fontSize: typography.tiny },
  updateEmpty: { color: colors.textMuted, fontSize: typography.small },
  ruleCard: { paddingVertical: spacing.md },
  ruleTitle: { fontWeight: "700", color: colors.text, fontSize: typography.body },
  ruleBody: { marginTop: 2, color: colors.textMuted, fontSize: typography.small },
});
