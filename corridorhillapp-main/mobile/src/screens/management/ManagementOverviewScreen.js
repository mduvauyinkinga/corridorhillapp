import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { ScreenTitle, SectionTitle } from "../../components/Layout";
import { ErrorNotice, LoadingState } from "../../components/States";
import { computeStats, loadManagementData } from "../../services/managementService";
import { colors, radius, spacing, typography } from "../../theme";
import { getFirebaseErrorMessage } from "../../utils/errors";

export default function ManagementOverviewScreen({ navigation }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await loadManagementData();
      setStats(computeStats(data));
    } catch (loadError) {
      console.error("[ManagementOverviewScreen] load error:", loadError);
      setError(getFirebaseErrorMessage(loadError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  if (loading) return <LoadingState message="Loading management overview…" />;

  const destinations = [
    {
      title: "Complaints",
      icon: "clipboard-outline",
      value: stats?.complaints,
      detail: `${stats?.submitted ?? 0} submitted · ${stats?.inProgress ?? 0} in progress`,
      tab: "Complaints",
    },
    {
      title: "Residents",
      icon: "people-outline",
      value: stats?.residents,
      detail: "View resident profiles",
      tab: "Residents",
    },
    {
      title: "Unit profiles",
      icon: "grid-outline",
      value: stats?.rooms,
      detail: `${stats?.occupied ?? 0} occupied · ${stats?.available ?? 0} available beds`,
      tab: "Units",
    },
    {
      title: "Occupancy",
      icon: "bed-outline",
      value: stats?.occupied,
      detail: `${stats?.available ?? 0} available beds`,
      tab: "Occupancy",
    },
  ];

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      <ScreenTitle
        title="Management overview"
        subtitle="Choose a summary to open its details."
      />
      <ErrorNotice message={error} onRetry={load} />
      <SectionTitle>Residence at a glance</SectionTitle>
      <View style={styles.grid}>
        {destinations.map((destination) => (
          <Pressable
            key={destination.tab}
            accessibilityRole="button"
            accessibilityLabel={`${destination.title}, ${destination.value ?? "—"}. ${destination.detail}`}
            onPress={() => navigation.navigate(destination.tab)}
            style={({ pressed }) => [
              styles.tile,
              pressed && styles.tilePressed,
            ]}
          >
            <View style={styles.tileHead}>
              <Text style={styles.tileTitle}>{destination.title}</Text>
              <View style={styles.iconBadge}>
                <Ionicons name={destination.icon} size={22} color={colors.primary} />
              </View>
            </View>
            <Text style={styles.tileValue}>{String(destination.value ?? "—")}</Text>
            <Text style={styles.tileDetail}>{destination.detail}</Text>
            <Text style={styles.tileLink}>Open →</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  tile: {
    flex: 1,
    minWidth: "47%",
    minHeight: 160,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: "space-between",
    borderTopWidth: 4,
    borderTopColor: colors.primary,
  },
  tilePressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  tileHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  tileTitle: {
    flex: 1,
    color: colors.text,
    fontSize: typography.body,
    fontWeight: "700",
  },
  iconBadge: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.border,
  },
  tileValue: {
    color: colors.primary,
    fontSize: 28,
    fontWeight: "700",
  },
  tileDetail: {
    flex: 1,
    color: colors.textMuted,
    fontSize: typography.small,
    lineHeight: 19,
  },
  tileLink: {
    marginTop: spacing.sm,
    color: colors.primary,
    fontSize: typography.body,
    fontWeight: "700",
  },
});
