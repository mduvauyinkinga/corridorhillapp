/**
 * screens/management/OccupancyScreen.js
 * ------------------------------------------------------------------
 * The Occupancy tab — port of `#view-occupancy` + renderOccupancy() in
 * js/management.js: a block filter plus one card per room showing its
 * A/B/C sub-room chips ("Room A — 1/2 occupied") with the website's
 * occupied/available chip colours.
 *
 * The bulk read happens once per focus (page-load equivalent); the rows
 * are derived in memory via buildOccupancyRows, so no extra Firestore
 * reads are performed.
 */

import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";

import { OccupancyChip } from "../../components/Badges";
import { Card, ScreenTitle, SectionTitle } from "../../components/Layout";
import OptionPicker from "../../components/OptionPicker";
import { EmptyState, ErrorNotice, LoadingState } from "../../components/States";
import { buildOccupancyRows, loadManagementData } from "../../services/managementService";
import { colors, spacing, typography } from "../../theme";
import { getFirebaseErrorMessage } from "../../utils/errors";

const BLOCK_OPTIONS = [
  { value: "", label: "All blocks" },
  ...["A", "B", "C", "D", "E", "F"].map((letter) => ({
    value: letter,
    label: `Block ${letter}`,
  })),
];

export default function OccupancyScreen() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [block, setBlock] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await loadManagementData());
    } catch (loadError) {
      console.error("[OccupancyScreen] load error:", loadError);
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

  const rows = useMemo(() => {
    if (!data) return [];
    return buildOccupancyRows({
      roomsMap: data.roomsMap,
      unitsByRoom: data.unitsByRoom,
      block,
    });
  }, [data, block]);

  if (loading) return <LoadingState message="Loading occupancy…" />;

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => item.roomId}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
      ListHeaderComponent={
        <View>
          <ScreenTitle
            title="Occupancy"
            subtitle="Bed occupancy per room, grouped by sub-room."
          />
          <ErrorNotice message={error} onRetry={load} />
          <OptionPicker
            label="Block"
            value={block}
            options={BLOCK_OPTIONS}
            onChange={setBlock}
            placeholder="All blocks"
            modalTitle="Filter by block"
          />
          <SectionTitle>{`${rows.length} room${rows.length === 1 ? "" : "s"}`}</SectionTitle>
        </View>
      }
      ListEmptyComponent={<EmptyState message="No occupancy data available." />}
      renderItem={({ item }) => (
        <Card style={styles.card}>
          <Text style={styles.label}>{item.label}</Text>
          <View style={styles.chips}>
            {item.subRooms.map((subRoom) => (
              <OccupancyChip
                key={`${item.roomId}-${subRoom.letter}`}
                occupied={subRoom.occupied > 0}
                label={`Room ${subRoom.letter} — ${subRoom.occupied}/${subRoom.total} occupied`}
              />
            ))}
          </View>
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  card: { paddingVertical: spacing.md },
  label: { fontSize: typography.body, fontWeight: "700", color: colors.text },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
