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
 *     labelled "Unit Alerts" when the announcement wins,
 *   - house rules from the website's dashboard.
 *
 * Errors never blank the screen: each section shows its own notice, which
 * is the mobile equivalent of the website's per-section error handling.
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import Button from "../../components/Button";
import ComplaintCard from "../../components/ComplaintCard";
import { Card, ScreenTitle, SectionTitle } from "../../components/Layout";
import NoteList from "../../components/NoteList";
import RoomSummary from "../../components/RoomSummary";
import StatCard from "../../components/StatCard";
import { EmptyState, ErrorNotice, LoadingState } from "../../components/States";
import { HOUSE_RULES } from "../../config/branding";
import { useAuth } from "../../context/AuthContext";
import { fetchLatestAnnouncement } from "../../services/announcementService";
import { subscribeResidentMessages } from "../../services/unitMessageService";
import { fetchResidentComplaints } from "../../services/complaintService";
import { fetchLatestNote } from "../../services/noteService";
import { fetchRoom, fetchUnit } from "../../services/roomService";
import { colors, spacing, typography } from "../../theme";
import { isActiveStatus, normalizeStatus } from "../../utils/complaints";
import { formatDate, timestampMs } from "../../utils/dates";
import { getFirebaseErrorMessage } from "../../utils/errors";

export default function DashboardScreen({ navigation }) {
  const { profile, uid } = useAuth();

  const [complaints, setComplaints] = useState([]);
  const [roomInfo, setRoomInfo] = useState({ block: null, roomNumber: null, roomLetter: null });
  const [latestUpdate, setLatestUpdate] = useState(null);
  const [unitMessages, setUnitMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [openSection, setOpenSection] = useState(null);

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
  const resolveLatestUpdate = useCallback(async (residentComplaints, roomId, messages) => {
    const target = residentComplaints[0] || null;
    const [note, announcement] = await Promise.all([
      target ? fetchLatestNote(target.id) : Promise.resolve(null),
      roomId ? fetchLatestAnnouncement(roomId) : Promise.resolve(null),
    ]);

    const noteDate = timestampMs(note?.createdAt);
    const announcementDate = timestampMs(announcement?.createdAt);
    const latestMessage = messages[0] || null;
    const messageDate = timestampMs(latestMessage?.createdAt);
    if (messageDate > Math.max(noteDate, announcementDate)) {
      return { ...latestMessage, isAnnouncement: true };
    }
    if (announcementDate > noteDate) return { ...announcement, isAnnouncement: true };
    return note;
  }, []);

  const load = useCallback(async () => {
    if (!profile || !uid) return;
    setError("");
    try {
      const [list, info, messages] = await Promise.all([
        fetchResidentComplaints(uid),
        resolveRoomInfo(profile),
        fetchResidentMessages(uid),
      ]);
      setComplaints(list);
      setRoomInfo(info);
      setUnitMessages(messages);

      try {
        setLatestUpdate(await resolveLatestUpdate(list, profile.roomId, messages));
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

  useEffect(() => {
    if (!uid) return undefined;
    return subscribeResidentMessages(
      uid,
      (messages) => {
        setUnitMessages(messages);
        resolveLatestUpdate(complaints, profile?.roomId, messages)
          .then(setLatestUpdate)
          .catch((updateError) => {
            console.warn("[DashboardScreen] live message update error:", updateError);
          });
      },
      (listenerError) => {
        console.warn("[DashboardScreen] unit inbox listener error:", listenerError);
      }
    );
  }, [uid, profile?.roomId, complaints, resolveLatestUpdate]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const active = complaints.filter((c) => isActiveStatus(c.status));
  const inProgress = complaints.filter((c) => normalizeStatus(c.status) === "In Progress");
  const completed = complaints.filter((c) => normalizeStatus(c.status) === "Completed");
  const dashboardSections = [
    { id: "active", title: "Active complaints", icon: "construct-outline", count: active.length },
    { id: "updates", title: "Latest update", icon: "megaphone-outline" },
    { id: "messages", title: "Unit messages", icon: "chatbubbles-outline", count: unitMessages.length },
    { id: "history", title: "Complaint history", icon: "time-outline", count: complaints.length },
    { id: "rules", title: "House rules", icon: "book-outline", count: HOUSE_RULES.length },
  ];

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

      <SectionTitle style={styles.sectionSpacer}>Explore your dashboard</SectionTitle>
      <View style={styles.sectionGrid}>
        {dashboardSections.map((section) => (
          <Pressable
            key={section.id}
            accessibilityRole="button"
            accessibilityLabel={`${section.title}${section.count == null ? "" : `, ${section.count}`}`}
            accessibilityState={{ selected: openSection === section.id }}
            onPress={() =>
              setOpenSection((current) => current === section.id ? null : section.id)
            }
            style={({ pressed }) => [
              styles.sectionButton,
              openSection === section.id && styles.sectionButtonSelected,
              pressed && styles.sectionButtonPressed,
            ]}
          >
            <View style={styles.sectionButtonHead}>
              <Text
                style={[
                  styles.sectionButtonTitle,
                  openSection === section.id && styles.sectionButtonTitleSelected,
                ]}
              >
                {section.title}
              </Text>
              <View
                style={[
                  styles.sectionIconBadge,
                  openSection === section.id && styles.sectionIconBadgeSelected,
                ]}
              >
                <Ionicons
                  name={section.icon}
                  size={21}
                  color={openSection === section.id ? "#ffffff" : colors.primary}
                />
              </View>
            </View>
            <View style={styles.sectionButtonFoot}>
              <Text
                style={[
                  styles.sectionButtonCount,
                  openSection === section.id && styles.sectionButtonTitleSelected,
                ]}
              >
                {section.count == null
                  ? "View latest update"
                  : `${section.count} ${section.id === "active" ? "open" : "items"}`}
              </Text>
              <Ionicons
                name="arrow-forward"
                size={19}
                color={openSection === section.id ? "#ffffff" : colors.primary}
              />
            </View>
          </Pressable>
        ))}
      </View>

      {openSection === "active" ? (
        <View>
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
        </View>
      ) : null}

      {openSection === "updates" ? (
        <View>
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
                      ? "Unit Alerts"
                      : latestUpdate.authorName || "Management"
                  } · ${formatDate(latestUpdate.createdAt)}`}
                </Text>
              </>
            ) : (
              <Text style={styles.updateEmpty}>No maintenance updates yet.</Text>
            )}
          </Card>
        </View>
      ) : null}

      {openSection === "messages" ? (
        <View>
          <SectionTitle style={styles.sectionSpacer}>Messages for your unit</SectionTitle>
          <NoteList
            notes={unitMessages.map((message) => ({
              ...message,
              scope: `Block ${message.block} · Unit ${message.unitNumber} · ${message.roomLetter ? `Room ${message.roomLetter}` : "Entire unit"}`,
            }))}
            emptyMessage="No messages for your unit yet."
          />
        </View>
      ) : null}

      {openSection === "history" ? (
        <View>
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
        </View>
      ) : null}

      {openSection === "rules" ? (
        <View>
          <SectionTitle style={styles.sectionSpacer}>House rules</SectionTitle>
          {HOUSE_RULES.map((rule) => (
            <Card key={rule.title} style={styles.ruleCard}>
              <Text style={styles.ruleTitle}>{rule.title}</Text>
              <Text style={styles.ruleBody}>{rule.body}</Text>
            </Card>
          ))}
        </View>
      ) : null}

      {loading && <LoadingState message="Loading complaints…" />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  actions: { gap: spacing.md, marginBottom: spacing.lg },
  statsRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  sectionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  sectionButton: {
    flex: 1,
    minWidth: "47%",
    minHeight: 124,
    padding: spacing.lg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: "space-between",
    borderTopWidth: 4,
    borderTopColor: colors.primary,
  },
  sectionButtonSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  sectionButtonPressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  sectionButtonHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  sectionButtonTitle: {
    flex: 1,
    color: colors.text,
    fontSize: typography.body,
    fontWeight: "700",
  },
  sectionButtonTitleSelected: { color: colors.white },
  sectionIconBadge: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: colors.border,
  },
  sectionIconBadgeSelected: { backgroundColor: "rgba(255, 255, 255, 0.16)" },
  sectionButtonFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  sectionButtonCount: {
    flex: 1,
    color: colors.primary,
    fontSize: typography.small,
    fontWeight: "700",
  },
  sectionSpacer: { marginTop: spacing.xl },
  updateText: { color: colors.text, fontSize: typography.body },
  updateMeta: { marginTop: spacing.sm, color: colors.textMuted, fontSize: typography.tiny },
  updateEmpty: { color: colors.textMuted, fontSize: typography.small },
  ruleCard: { paddingVertical: spacing.md },
  ruleTitle: { fontWeight: "700", color: colors.text, fontSize: typography.body },
  ruleBody: { marginTop: 2, color: colors.textMuted, fontSize: typography.small },
});
