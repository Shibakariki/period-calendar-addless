// TODO:
// - Notifications
// - Remake UI for better user experience
// - Add logo and animated opening screen

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

type Mark = { startingDay: boolean; endingDay: boolean; color: string };
type FormState = { id: number | null; startDate: string; endDate: string; notes: string };

const EMPTY_FORM: FormState = { id: null, startDate: '', endDate: '', notes: '' };

// `predictedCycleTime` et `isPredicted` viennent de l'ancienne version : plus utilisés ici, mais toujours
// présents dans le type Cycle et dans la table (colonnes NOT NULL, d'où ces valeurs neutres).
// À supprimer quand vous nettoierez db/ (par une migration `user_version = 2`).
const makeCycle = (id: number, startDate: string, endDate: string | null, notes: string | null): Cycle => ({
  id,
  startDate,
  endDate,
  notes,
  predictedCycleTime: 0,
  isPredicted: false,
});

// Ignore (sans planter) les lignes invalides laissées par d'anciens tests
const isUsable = (c: Cycle) => isValidISODate(c.startDate) && (!c.endDate || isValidISODate(c.endDate));

const formatDays = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

// Colorie chaque jour de start à end (inclus). Les dates restent des chaînes 'YYYY-MM-DD' :
// aucun new Date(), donc ni décalage de fuseau horaire ni problème d'heure d'été.
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.cycleInfoRow}>
      <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
      <ThemedText>{value}</ThemedText>
    </View>
  );
}

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

  // --- Outils de debug (visibles seulement en développement) -----------------------

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

  // --- Affichage -------------------------------------------------------------------

  const renderDetails = () => {
    if (selectedCycle) {
      const days = periodDays(selectedCycle);
      return (
        <>
          <InfoRow label="Start" value={selectedCycle.startDate} />
          <InfoRow label="End" value={selectedCycle.endDate ?? 'Ongoing'} />
          <InfoRow
            label={days !== null ? 'Real Duration' : 'Expected Duration'}
            value={formatDays(days ?? periodLength)}
          />
          <View style={styles.notesBlock}>
            <ThemedText type="small" themeColor="textSecondary">Notes</ThemedText>
            <ThemedText>{selectedCycle.notes ?? ''}</ThemedText>
          </View>

          <ThemedButton label="Edit Cycle" type="primary" onPress={() => openForm(selectedCycle)} />
          {!selectedCycle.endDate && selectedCycle.startDate <= today && (
            <ThemedButton label="Mark as Today" type="secondary" onPress={() => markAsToday(selectedCycle)} />
          )}
          {!selectedCycle.endDate && displayEnd(selectedCycle, periodLength) <= today && (
            <ThemedButton
              label="Mark as Predicted"
              type="secondary"
              onPress={() => markAsPredicted(selectedCycle)}
            />
          )}
          <ThemedButton label="Delete" type="secondary" onPress={() => confirmDelete(selectedCycle)} />
        </>
      );
    }

    if (selectedPrediction) {
      const canConfirm = selectedPrediction.startDate <= today; // on ne confirme pas des règles à venir
      return (
        <>
          <ThemedText type="small" themeColor="textSecondary">Predicted period</ThemedText>
          <InfoRow label="Start" value={selectedPrediction.startDate} />
          <InfoRow label="End" value={selectedPrediction.endDate} />
          <InfoRow label="Predicted Duration" value={formatDays(selectedPrediction.periodLength)} />
          <InfoRow label="Average Cycle" value={formatDays(selectedPrediction.cycleLength)} />

          {canConfirm && (
            <ThemedButton
              label="Mark as Predicted"
              type="primary"
              onPress={() => confirmPrediction(selectedPrediction)}
            />
          )}
          <ThemedButton
            label="Add Cycle"
            type={canConfirm ? 'secondary' : 'primary'}
            onPress={() => openForm(null)}
          />
        </>
      );
    }

    return (
      <>
        <ThemedText>{selectedDate}</ThemedText>
        <ThemedButton label="Add Cycle" type="primary" onPress={() => openForm(null)} />
      </>
    );
  };

  return (
    <ThemedView style={styles.view}>
      {__DEV__ && (
        <View style={styles.devTools}>
          <ThemedButton label="Log DB" type="secondary" onPress={() => logDbTables().catch(console.error)} />
          <ThemedButton label="Reset cycles" type="ghost" onPress={resetTable} />
          <ThemedButton label="Recreate DB" type="ghost" onPress={recreateDb} />
        </View>
      )}

      <Calendar
        style={styles.calendar}
        theme={calendarTheme}
        markedDates={markedDates}
        markingType="period"
        onDayPress={day => setSelectedDate(day.dateString)}
      />

      <ScrollView
        style={styles.selectedCycleScroll}
        contentContainerStyle={styles.selectedCycleContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ThemedView style={styles.selectedCycleView}>{renderDetails()}</ThemedView>
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.overlay}>
          <ThemedView style={styles.modal}>
            <ThemedText type="subtitle">{form.id === null ? 'New Cycle' : 'Edit Cycle'}</ThemedText>

            <ThemedText type="small" themeColor="textSecondary">Start Date (YYYY-MM-DD)</ThemedText>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              placeholderTextColor={theme.textSecondary}
              placeholder="2026-09-01"
              value={form.startDate}
              onChangeText={startDate => updateForm({ startDate })}
              maxLength={10}
              autoCorrect={false}
            />

            <ThemedText type="small" themeColor="textSecondary">End Date (optional)</ThemedText>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              placeholderTextColor={theme.textSecondary}
              placeholder="2026-09-05"
              value={form.endDate}
              onChangeText={endDate => updateForm({ endDate })}
              maxLength={10}
              autoCorrect={false}
            />

            <ThemedText type="small" themeColor="textSecondary">Notes (optional)</ThemedText>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              placeholderTextColor={theme.textSecondary}
              placeholder="..."
              value={form.notes}
              onChangeText={notes => updateForm({ notes })}
            />

            {formError !== null && <Text style={styles.errorText}>{formError}</Text>}

            <View style={styles.modalActions}>
              <ThemedButton label="Cancel" type="ghost" onPress={() => setModalVisible(false)} />
              <ThemedButton label={form.id === null ? 'Add' : 'Save'} type="primary" onPress={saveForm} />
            </View>
          </ThemedView>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  view: {
    width: '100%',
  },
  devTools: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  calendar: {
    borderWidth: 0.2,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    overflow: 'hidden',
  },
  selectedCycleScroll: {
    marginTop: 20,
    maxHeight: 220,
  },
  selectedCycleContent: {
    paddingBottom: 12,
  },
  selectedCycleView: {
    padding: 10,
    borderWidth: 0.2,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    overflow: 'hidden',
    gap: 8,
  },
  cycleInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  notesBlock: {
    gap: 4,
    paddingTop: 4,
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
    borderRadius: 12,
    padding: 24,
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    marginBottom: 4,
  },
  errorText: {
    color: ERROR_COLOR,
    fontSize: 13,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
});
