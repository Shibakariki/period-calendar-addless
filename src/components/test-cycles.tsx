// TODO:
// - Notifications
// - Add selection of date with another calendar in modal form
// - Add logo and animated opening screen
// - Add statistics and charts for cycle tracking

import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { addCycleInDb, deleteCycleInDb, getAllCyclesInDb, resetCyclesInDb, updateCycleInDb } from '../db/cycles';
import { getDb, recreateCyclesTable } from '../db/database';
import type { Cycle } from '../db/types';
import type { PeriodError, Prediction } from '../logic/cycles';
import { DEFAULT_PERIOD_LENGTH, displayEnd, periodDays, predictNextPeriod, validatePeriod } from '../logic/cycles';
import { addDaysISO, diffDays, isValidISODate, todayISO } from '../logic/dates';
import { ThemedButton } from './themed-button';
import { ThemedText } from './themed-text';

const ERROR_COLOR = '#c0392b';
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Mark = { startingDay: boolean; endingDay: boolean; color: string };
type FormState = { id: number | null; startDate: string; endDate: string; notes: string };

const EMPTY_FORM: FormState = { id: null, startDate: '', endDate: '', notes: '' };

// `predictedCycleTime` and `isPredicted` are legacy columns kept to avoid a schema migration.
const makeCycle = (id: number, startDate: string, endDate: string | null, notes: string | null): Cycle => ({
  id,
  startDate,
  endDate,
  notes,
  predictedCycleTime: 0,
  isPredicted: false,
});

const isUsable = (c: Cycle) => isValidISODate(c.startDate) && (!c.endDate || isValidISODate(c.endDate));

const formatDays = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

// Timezone-safe ISO date formatter — no Date constructor, no UTC offset shift
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
};

function markRange(marks: Record<string, Mark>, start: string, end: string, color: (day: string) => string) {
  const last = Math.max(0, diffDays(end, start));
  for (let i = 0; i <= last; i++) {
    const day = addDaysISO(start, i);
    marks[day] = { startingDay: i === 0, endingDay: i === last, color: color(day) };
  }
}

function describeError(error: PeriodError): string {
  switch (error.code) {
    case 'invalid-start':
      return 'The start date is not valid. Use the format YYYY-MM-DD, for example 2026-09-01.';
    case 'invalid-end':
      return 'The end date is not valid. Use the format YYYY-MM-DD, or leave it empty.';
    case 'end-before-start':
      return 'The end date must be on or after the start date.';
    case 'overlap':
      return `These dates overlap the cycle starting on ${error.with}. Change the dates or edit that cycle.`;
  }
}

// ─── Presentational sub-components ───────────────────────────────────────────

function StatusPill({ label, color }: { label: string; color: string }) {
  return (
    <View style={[pillStyles.pill, { borderColor: color }]}>
      <Text style={[pillStyles.text, { color }]}>{label}</Text>
    </View>
  );
}

const pillStyles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  text: { fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
});

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={infoRowStyles.row}>
      <ThemedText type="small" themeColor="textSecondary" style={infoRowStyles.label}>{label}</ThemedText>
      <ThemedText type="small">{value}</ThemedText>
    </View>
  );
}

const infoRowStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
  label: { flex: 1 },
});

export default function TestCycles() {
  const theme = useTheme();
  const [cycles, setCycles] = useState<Cycle[]>([]); // uniquement les vraies données de la base
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const busy = useRef(false);

  const today = todayISO();

  // --- Données ---------------------------------------------------------------

  const reload = useCallback(async () => {
    const rows = await getAllCyclesInDb();
    const usable = rows.filter(isUsable);
    if (usable.length < rows.length) console.warn(`[cycles] ${rows.length - usable.length} invalid row(s) ignored`);
    setCycles(usable);
  }, []);

  useEffect(() => {
    reload().catch(console.error);
  }, [reload]);

  const alertFailure = () => Alert.alert('Not saved', 'The change could not be saved. Try again.');

  // Une écriture en base à la fois (les doubles appuis sont ignorés), puis rechargement de la liste.
  // Renvoie true si l'écriture a réussi.
  const write = async (action: () => Promise<unknown>, onFail: () => void = alertFailure) => {
    if (busy.current) return false;
    busy.current = true;
    try {
      await action();
    } catch (e) {
      console.error(e);
      onFail();
      return false;
    } finally {
      busy.current = false;
    }
    await reload().catch(console.error);
    return true;
  };

  // --- Valeurs calculées (jamais stockées) -------------------------------------

  const prediction = useMemo(() => predictNextPeriod(cycles), [cycles]);
  const periodLength = prediction?.periodLength ?? DEFAULT_PERIOD_LENGTH;

  const selectedCycle = useMemo(
    () => cycles.find(c => selectedDate >= c.startDate && selectedDate <= displayEnd(c, periodLength)) ?? null,
    [cycles, selectedDate, periodLength],
  );

  const selectedPrediction =
    !selectedCycle && prediction && selectedDate >= prediction.startDate && selectedDate <= prediction.endDate
      ? prediction
      : null;

  // Cycle currently active today — drives the summary banner
  const activeCycle = useMemo(
    () => cycles.find(c => c.startDate <= today && displayEnd(c, periodLength) >= today) ?? null,
    [cycles, today, periodLength],
  );

  const markedDates = useMemo(() => {
    const marks: Record<string, Mark> = {};
    for (const c of cycles) {
      // Règles en cours (sans fin) : le 1er jour est réel, les suivants sont estimés
      markRange(marks, c.startDate, displayEnd(c, periodLength), day =>
        c.endDate || day === c.startDate ? theme.dateRegistered : theme.datePredicted,
      );
    }
    if (prediction) markRange(marks, prediction.startDate, prediction.endDate, () => theme.datePredicted);
    if (!marks[selectedDate]) {
      marks[selectedDate] = { startingDay: true, endingDay: true, color: theme.dateSelection };
    }
    return marks;
  }, [cycles, prediction, periodLength, selectedDate, theme]);

  const calendarTheme = useMemo(
    () => ({
      calendarBackground: theme.backgroundElement,
      textSectionTitleColor: theme.text,
      todayTextColor: theme.dateRegistered,
      todayBackgroundColor: theme.textInDate,
      monthTextColor: theme.text,
      arrowColor: theme.dateRegistered,
    }),
    [theme],
  );

  // --- Actions -------------------------------------------------------------------

  const openForm = (cycle: Cycle | null) => {
    setForm(
      cycle
        ? { id: cycle.id, startDate: cycle.startDate, endDate: cycle.endDate ?? '', notes: cycle.notes ?? '' }
        : { ...EMPTY_FORM, startDate: selectedDate },
    );
    setFormError(null);
    setModalVisible(true);
  };

  const updateForm = (patch: Partial<FormState>) => {
    setForm(f => ({ ...f, ...patch }));
    setFormError(null);
  };

  const saveForm = async () => {
    const startDate = form.startDate.trim();
    const endDate = form.endDate.trim();

    const error = validatePeriod({ id: form.id, startDate, endDate }, cycles, periodLength);
    if (error) {
      setFormError(describeError(error));
      return;
    }

    const cycle = makeCycle(form.id ?? 0, startDate, endDate || null, form.notes.trim() || null);
    const saved = await write(
      () => (form.id === null ? addCycleInDb(cycle) : updateCycleInDb(cycle)),
      () => setFormError('The cycle could not be saved. Try again.'),
    );
    if (saved) {
      setModalVisible(false);
      setSelectedDate(startDate);
    }
  };

  const markAsToday = (cycle: Cycle) => write(() => updateCycleInDb({ ...cycle, endDate: today }));

  const markAsPredicted = (cycle: Cycle) =>
    write(() => updateCycleInDb({ ...cycle, endDate: displayEnd(cycle, periodLength) }));

  // La prévision n'existe pas en base : la confirmer crée un vrai cycle.
  // Si la fin prévue n'est pas encore passée, les règles sont considérées comme en cours.
  const confirmPrediction = (p: Prediction) =>
    write(() => addCycleInDb(makeCycle(0, p.startDate, p.endDate <= today ? p.endDate : null, null)));

  const confirmDelete = (cycle: Cycle) =>
    Alert.alert('Delete this cycle?', `The cycle starting on ${cycle.startDate} will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => write(() => deleteCycleInDb(cycle.id)) },
    ]);

  // --- Debug tools (dev only) ------------------------------------------------

  const logDbTables = async () => {
    const db = await getDb();
    const tables = await db.getAllAsync<{ name: string }>(`SELECT name FROM sqlite_master WHERE type='table'`);
    for (const table of tables) {
      const rows = await db.getAllAsync(`SELECT * FROM "${table.name}"`);
      console.log(`[DB] Table "${table.name}":`, rows);
    }
  };

  const resetTable = () =>
    write(async () => {
      await resetCyclesInDb();
      console.log('[DB] cycles table reset');
    });

  const recreateDb = () =>
    write(async () => {
      await recreateCyclesTable();
      console.log('[DB] cycles table recreated');
    });

  // --- Detail panel ----------------------------------------------------------

  const renderDetails = () => {
    if (selectedCycle) {
      const days = periodDays(selectedCycle);
      const isOngoing = !selectedCycle.endDate;
      const dayNum = diffDays(today, selectedCycle.startDate) + 1;
      const estimatedEnd = displayEnd(selectedCycle, periodLength);
      const canEndToday = isOngoing && selectedCycle.startDate <= today;
      const canEndEstimated = isOngoing && estimatedEnd < today;

      return (
        <>
          <View style={styles.detailHeader}>
            <StatusPill
              label={isOngoing ? 'Ongoing' : 'Completed'}
              color={isOngoing ? theme.datePredicted : theme.dateRegistered}
            />
            <ThemedText type="small" themeColor="textSecondary">
              {selectedDate ? fmtDate(selectedDate) : ''}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {isOngoing ? `Day ${dayNum}` : formatDays(days ?? periodLength)}
            </ThemedText>
          </View>

          <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />

          <InfoRow label="Started" value={fmtDate(selectedCycle.startDate)} />
          <InfoRow
            label={selectedCycle.endDate ? 'Ended' : 'Est. end'}
            value={fmtDate(selectedCycle.endDate ?? estimatedEnd)}
          />

          {selectedCycle.notes ? (
            <>
              <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />
              <ThemedText type="small" themeColor="textSecondary">Notes</ThemedText>
              <ThemedText type="small">{selectedCycle.notes}</ThemedText>
            </>
          ) : null}

          <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />

          <ThemedButton label="Edit Cycle" type="primary" onPress={() => openForm(selectedCycle)} />

          {(canEndToday || canEndEstimated) && (
            <View style={styles.actionRow}>
              {canEndToday && (
                <ThemedButton
                  label="End Today"
                  type="secondary"
                  style={styles.flex1}
                  onPress={() => markAsToday(selectedCycle)}
                />
              )}
              {canEndEstimated && (
                <ThemedButton
                  label="End Estimated"
                  type="secondary"
                  style={styles.flex1}
                  onPress={() => markAsPredicted(selectedCycle)}
                />
              )}
            </View>
          )}

          <ThemedButton
            label="Delete Cycle"
            type="ghost"
            themeColor="textSecondary"
            onPress={() => confirmDelete(selectedCycle)}
          />
        </>
      );
    }

    if (selectedPrediction) {
      const canConfirm = selectedPrediction.startDate <= today;
      return (
        <>
          <View style={styles.detailHeader}>
            <StatusPill label="Predicted" color={theme.datePredicted} />
            <ThemedText type="small" themeColor="textSecondary">
              {fmtDate(selectedDate)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              ~{formatDays(selectedPrediction.periodLength)}
            </ThemedText>
          </View>

          <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />

          <InfoRow label="Expected start" value={fmtDate(selectedPrediction.startDate)} />
          <InfoRow label="Expected end" value={fmtDate(selectedPrediction.endDate)} />

          <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />

          {canConfirm ? (
            <View style={styles.actionRow}>
              <ThemedButton
                label="Confirm Period"
                type="primary"
                style={styles.flex1}
                onPress={() => confirmPrediction(selectedPrediction)}
              />
              <ThemedButton
                label="Add Manually"
                type="secondary"
                style={styles.flex1}
                onPress={() => openForm(null)}
              />
            </View>
          ) : (
            <ThemedButton label="Add Cycle" type="primary" onPress={() => openForm(null)} />
          )}
        </>
      );
    }

    return (
      <View style={styles.emptyState}>
        <ThemedText type="small" themeColor="textSecondary">{fmtDate(selectedDate)}</ThemedText>
        <ThemedButton label="Add Cycle" type="primary" onPress={() => openForm(null)} />
      </View>
    );
  };

  // --- Summary banner --------------------------------------------------------

  const renderBanner = () => {
    if (activeCycle) {
      const estimatedEnd = displayEnd(activeCycle, periodLength);
      const dayNum = diffDays(today, activeCycle.startDate) + 1;
      return (
        <View style={[styles.banner, { backgroundColor: theme.backgroundElement, borderLeftColor: theme.dateRegistered }]}>
          <ThemedText type="smallBold">Period active · Day {dayNum}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Started {fmtDate(activeCycle.startDate)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {!activeCycle.endDate ? 'End estimated ' + fmtDate(estimatedEnd) : ''}
          </ThemedText>
        </View>
      );
    }
    if (prediction) {
      const daysUntil = diffDays(prediction.startDate, today);
      const headline =
        daysUntil < 0
          ? `Period may have started · ${formatDays(Math.abs(daysUntil))} overdue`
          : daysUntil === 0
          ? 'Period expected today'
          : `Next period in ${formatDays(daysUntil)}`;
      return (
        <View style={[styles.banner, { backgroundColor: theme.backgroundElement, borderLeftColor: theme.datePredicted }]}>
          <ThemedText type="smallBold">{headline}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Around {fmtDate(prediction.startDate)} · ~{prediction.cycleLength}-day cycle
          </ThemedText>
        </View>
      );
    }
    return (
      <View style={[styles.banner, { backgroundColor: theme.backgroundElement, borderLeftColor: theme.backgroundSelected }]}>
        <ThemedText type="small" themeColor="textSecondary">Add your first cycle to get started</ThemedText>
      </View>
    );
  };

  // --- Render ----------------------------------------------------------------

  return (
    <ThemedView style={styles.screen}>
      {__DEV__ && (
        <View style={styles.devTools}>
          <ThemedButton label="Log DB" type="secondary" onPress={() => logDbTables().catch(console.error)} />
          <ThemedButton label="Reset" type="ghost" onPress={resetTable} />
          <ThemedButton label="Recreate" type="ghost" onPress={recreateDb} />
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        {renderBanner()}

        <Calendar
          style={styles.card}
          theme={calendarTheme}
          markedDates={markedDates}
          markingType="period"
          onDayPress={day => setSelectedDate(day.dateString)}
        />

        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.dateRegistered }]} />
            <ThemedText type="small" themeColor="textSecondary">Period</ThemedText>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.datePredicted }]} />
            <ThemedText type="small" themeColor="textSecondary">Estimated / Predicted</ThemedText>
          </View>
        </View>

        <ThemedView style={[styles.card, styles.detailCard]}>
          {renderDetails()}
        </ThemedView>
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.overlay}>
          <ThemedView style={[styles.card, styles.modal]}>
            <ThemedText type="subtitle">{form.id === null ? 'New Cycle' : 'Edit Cycle'}</ThemedText>

            <View style={styles.fieldGroup}>
              <ThemedText type="small" themeColor="textSecondary">Start Date</ThemedText>
              <TextInput
                style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected, backgroundColor: theme.backgroundElement }]}
                placeholderTextColor={theme.textSecondary}
                placeholder="YYYY-MM-DD"
                value={form.startDate}
                onChangeText={startDate => updateForm({ startDate })}
                maxLength={10}
                autoCorrect={false}
                keyboardType="numbers-and-punctuation"
              />
            </View>

            <View style={styles.fieldGroup}>
              <ThemedText type="small" themeColor="textSecondary">End Date (optional)</ThemedText>
              <TextInput
                style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected, backgroundColor: theme.backgroundElement }]}
                placeholderTextColor={theme.textSecondary}
                placeholder="YYYY-MM-DD"
                value={form.endDate}
                onChangeText={endDate => updateForm({ endDate })}
                maxLength={10}
                autoCorrect={false}
                keyboardType="numbers-and-punctuation"
              />
            </View>

            <View style={styles.fieldGroup}>
              <ThemedText type="small" themeColor="textSecondary">Notes (optional)</ThemedText>
              <TextInput
                style={[styles.input, styles.notesInput, { color: theme.text, borderColor: theme.backgroundSelected, backgroundColor: theme.backgroundElement }]}
                placeholderTextColor={theme.textSecondary}
                placeholder="How are you feeling?"
                value={form.notes}
                onChangeText={notes => updateForm({ notes })}
                multiline
              />
            </View>

            {formError !== null && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{formError}</Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <ThemedButton label="Cancel" type="ghost" style={styles.flex1} onPress={() => setModalVisible(false)} />
              <ThemedButton label={form.id === null ? 'Add' : 'Save'} type="primary" style={styles.flex1} onPress={saveForm} />
            </View>
          </ThemedView>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    width: '100%',
  },
  devTools: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  scrollContent: {
    gap: 12,
    paddingBottom: 16,
  },
  banner: {
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 4,
    gap: 2,
  },
  card: {
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 0.2,
    borderColor: '#e0e0e0',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  detailCard: {
    padding: 16,
    gap: 8,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  divider: {
    height: 1,
    width: '100%',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  flex1: {
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  overlay: {
    flex: 1,
    backgroundColor: '#00000066',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    width: '100%',
    maxWidth: 400,
    padding: 24,
    gap: 4,
  },
  fieldGroup: {
    gap: 4,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  notesInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  errorBox: {
    backgroundColor: '#c0392b22',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  errorText: {
    color: ERROR_COLOR,
    fontSize: 13,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
});
