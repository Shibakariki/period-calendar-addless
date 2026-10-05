import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { addCycleInDb, deleteCycleInDb, getAllCyclesInDb, resetCyclesInDb, updateCycleInDb } from '../db/cycles';
import { getDb, recreateCyclesTable } from '../db/database';
import type { Cycle } from '../db/types';
import { ThemedButton } from './themed-button';
import { ThemedText } from './themed-text';
export default function TestCycles() {
  const theme = useTheme();
  const [cycles, setCycles] = useState<Cycle[]>([]);

  useEffect(() => {
    (async () => {
        // await resetCyclesInDb();
        let list = await getAllCyclesInDb();
        // if (list.length === 0) {
        //     await addCycleInDb({ startDate: '2026-10-01',endDate: "2026-10-03", notes: null });
        //     await addCycleInDb({ startDate: '2026-10-19',endDate: null, notes: null });
        //     list = await getAllCyclesInDb();
        // }
      setCycles(list);
    })().catch(console.error);
  }, []);

  const deleteCycle = async (cycle: Cycle) => {
    await deleteCycleInDb(cycle.id);
    setCycles(cycles.filter(c => c !== cycle));
    setSelectedCycle(null);
    setSelectedDate(null);
  };

  const AddOrUpdateCycle = async () => {
    console.log('Adding or updating cycle with form data:', { formId, formStartDate, formEndDate, formNotes, formPredictedCycleTime });
    if (!formStartDate) return;
    var cycle: Cycle = { id: formId!, startDate: formStartDate, endDate: formEndDate || null, notes: formNotes || null, predictedCycleTime:formPredictedCycleTime || 0 };
    if (formId) {
        await updateCycleInDb(cycle);
        setModalVisible(false);
    }
    else {
        cycle = { ...cycle, predictedCycleTime: predictCycleTime(cycle) };
        await addCycleInDb(cycle);
    }
    setModalVisible(false);
    const list = await getAllCyclesInDb();
    setCycles(list);
    if (formId) {
      setSelectedCycle(list.find(c => c.id === formId) ?? null);
    }
    return;
  };

  const predictCycleTime = (cycle: Cycle) => {
    if (!cycle.startDate) return 0;
    var predictedCycleTime = 0;
    if (cycle.endDate) {
        const endDate = new Date(cycle.endDate);
        predictedCycleTime = Math.round((endDate.getTime() - new Date(cycle.startDate).getTime()) / 86_400_000);
    } else {
        if (cycles.length > 1) {
            // Make median of previous cycle times
            const previousCycleTimes = cycles.map(c => c.predictedCycleTime);
            previousCycleTimes.sort((a, b) => a - b);
            const mid = Math.floor(previousCycleTimes.length / 2);
            predictedCycleTime = previousCycleTimes.length % 2 !== 0 ? previousCycleTimes[mid] : (previousCycleTimes[mid - 1] + previousCycleTimes[mid]) / 2;
        } else {
            predictedCycleTime = 2; // Default cycle time
        }
    }
    return predictedCycleTime;
  };

  const predictNextCycle = () => {
    if (cycles.length === 0) return null;
    const lastCycle = cycles[cycles.length - 1];
    const startDate = new Date(lastCycle.startDate);
    startDate.setDate(startDate.getDate() + 28); // Assuming a 28-day cycle
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + (lastCycle.endDate ? Math.round((new Date(lastCycle.endDate).getTime() - new Date(lastCycle.startDate).getTime()) / 86_400_000) : 2)); // Default 3-day period
    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    };
  };

  const markAsToday = async (cycle: Cycle) => {
    const today = new Date().toISOString().split('T')[0];
    const updated: Cycle = { ...cycle, endDate: today };
    await updateCycleInDb(updated);
    const list = await getAllCyclesInDb();
    setCycles(list);
    setSelectedCycle(list.find(c => c.id === cycle.id) ?? null);
  };

  const markAsPredicted = async (cycle: Cycle) => {
    const predictEndDate = new Date(cycle.startDate);
    predictEndDate.setDate(predictEndDate.getDate() + (cycle.predictedCycleTime));
    const updated: Cycle = { ...cycle, endDate: predictEndDate.toISOString().split('T')[0] };
    await updateCycleInDb(updated);
    const list = await getAllCyclesInDb();
    setCycles(list);
    setSelectedCycle(list.find(c => c.id === cycle.id) ?? null);
  };

  const makeMarkedDates = () => {
    const acc = cycles.reduce((acc, cycle) => {
        const start = new Date(cycle.startDate);
        const isPredicted = !cycle.endDate;
        const endDate = isPredicted
          ? new Date(start)
          : new Date(cycle.endDate!);

        if (isPredicted) {
          endDate.setDate(endDate.getDate() + (cycle.predictedCycleTime || 1));
        }

        let current = new Date(start);
        while (current <= endDate) {
            const dateStr = current.toISOString().split('T')[0];
            const isStart = dateStr === cycle.startDate;
            const isEnd = Boolean(cycle.endDate ? dateStr === cycle.endDate : dateStr === endDate.toISOString().split('T')[0]);
            acc[dateStr] = {
                startingDay: isStart,
                endingDay: isEnd,
                color: isPredicted && !isStart ? theme.datePredicted : theme.dateRegistered,
            };
            current.setDate(current.getDate() + 1);
        }
        return acc;
    }, {} as Record<string, { startingDay?: boolean; endingDay?: boolean; color: string; selected?: boolean; selectedColor?: string }>);
    if (selectedDate && !acc[selectedDate]) {
        acc[selectedDate] = {
            selected: true,
            selectedColor: theme.dateSelection,
            startingDay: true,
            endingDay: true,
            color: theme.dateSelection,
        };
    }
    return acc;
  };


  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedCycle, setSelectedCycle] = useState<Cycle | null>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [formId, setFormId] = useState<number | null>(null);
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formPredictedCycleTime, setFormPredictedCycleTime] = useState(0);

  const openModal = () => {
    setFormId(selectedCycle?.id ?? null);
    setFormStartDate(selectedCycle?.startDate ?? selectedDate ?? '');
    setFormEndDate(selectedCycle?.endDate ?? '');
    setFormNotes(selectedCycle?.notes ?? '');
    setFormPredictedCycleTime(selectedCycle?.predictedCycleTime ?? 0);
    setModalVisible(true);
  };

    // DEBUG
  const logDbTables = async () => {
    const db = await getDb();
    const tables = await db.getAllAsync<{ name: string }>(`SELECT name FROM sqlite_master WHERE type='table'`);
    for (const table of tables) {
      const rows = await db.getAllAsync(`SELECT * FROM ${table.name}`);
      console.log(`[DB] Table "${table.name}":`, rows);
    }
  };

  const resetTable = async () => {
    await resetCyclesInDb();
    setCycles([]);
    setSelectedCycle(null);
    setSelectedDate(null);
    console.log('[DB] cycles table reset');
  };

    const recreateDb = async () => {
        await recreateCyclesTable();
        const list = await getAllCyclesInDb();
        setCycles(list);
        setSelectedCycle(null);
        setSelectedDate(null);
        console.log('[DB] cycles table recreated');
  };

  return (
    <ThemedView style={styles.view}>
        <View style={styles.devTools}>
            <ThemedButton label="Log DB" type="secondary" onPress={logDbTables} />
            <ThemedButton label="Reset cycles" type="ghost" onPress={resetTable} />
            <ThemedButton label="Recreate DB" type="ghost" onPress={recreateDb} />
        </View>
        <Calendar
            style={styles.calendar}
            theme={{ 
            calendarBackground: theme.backgroundElement,
            textSectionTitleColor: theme.text,
            todayTextColor: theme.dateRegistered,
            todayBackgroundColor: theme.textInDate,
            monthTextColor: theme.text,
            arrowColor: theme.dateRegistered,
            }}
            markedDates={makeMarkedDates()}
            markingType="period"
            onDayPress={(day) => {
                const selected = cycles.find(cycle => {
                    const date = day.dateString;
                    const start = cycle.startDate;
                    const end = cycle.endDate ?? (() => {
                        const computedEnd = new Date(cycle.startDate);
                        computedEnd.setDate(computedEnd.getDate() + (cycle.predictedCycleTime || 1));
                        return computedEnd.toISOString().split('T')[0];
                    })();
                    return date >= start && date <= end;
                });
                setSelectedCycle(selected ?? null);
                setSelectedDate(day.dateString);
            }}
        />
        <ScrollView
            style={styles.selectedCycleScroll}
            contentContainerStyle={styles.selectedCycleContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
        >
            <ThemedView style={styles.selectedCycleView}>
                {selectedCycle ? (
                    <>
                        <View style={styles.cycleInfoRow}>
                            <ThemedText type="small" themeColor="textSecondary">Start</ThemedText>
                            <ThemedText>{selectedCycle.startDate}</ThemedText>
                        </View>

                        <View style={styles.cycleInfoRow}>
                            <ThemedText type="small" themeColor="textSecondary">End</ThemedText>
                            <ThemedText>{selectedCycle.endDate ?? 'Ongoing'}</ThemedText>
                        </View>

                        <View style={styles.cycleInfoRow}>
                            <ThemedText type="small" themeColor="textSecondary">
                                {selectedCycle.endDate ? 'Real Duration' : 'Predicted Duration'}
                            </ThemedText>
                            <ThemedText>
                                {selectedCycle.endDate
                                    ? Math.max(
                                        1,
                                        Math.round(
                                          (new Date(selectedCycle.endDate).getTime() - new Date(selectedCycle.startDate).getTime()) / 86_400_000
                                        )
                                      ) + 1
                                    : (selectedCycle.predictedCycleTime + 1)} days
                            </ThemedText>
                        </View>

                        <View style={styles.notesBlock}>
                            <ThemedText type="small" themeColor="textSecondary">Notes</ThemedText>
                            <ThemedText>{selectedCycle.notes ?? 'No notes'}</ThemedText>
                        </View>

                        <ThemedButton 
                            label="Edit Cycle" 
                            type="primary" 
                            onPress={openModal} 
                        />
                    </>
                ) : (
                    <>
                        <ThemedText>{selectedDate}</ThemedText>
                        <ThemedButton 
                            label="Add Cycle" 
                            type="primary" 
                            onPress={openModal} 
                        />
                    </>
                )}

                {selectedCycle && !selectedCycle?.endDate && (
                    <>
                        <ThemedButton
                            label="Mark as Today"
                            type="secondary"
                            onPress={() => {
                                if (selectedCycle) {
                                    markAsToday(selectedCycle);
                                }
                            }}
                        />

                        <ThemedButton
                            label="Mark as Predicted"
                            type="secondary"
                            onPress={() => {
                                if (selectedCycle) {
                                    markAsPredicted(selectedCycle);
                                }
                            }}
                        />
                    </>
                )}

                {selectedCycle && (
                    <ThemedButton
                        label="Delete"
                        type="secondary"
                        onPress={() => {
                            deleteCycle(selectedCycle);
                        }}
                    />
                )}
            </ThemedView>
        </ScrollView>

        <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
            <View style={styles.overlay}>
                <ThemedView style={styles.modal}>
                    <ThemedText type="subtitle">New Cycle</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">Start Date (YYYY-MM-DD)</ThemedText>
                    <TextInput
                        style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                        placeholderTextColor={theme.textSecondary}
                        placeholder="2027-01-01"
                        value={formStartDate}
                        onChangeText={setFormStartDate}
                    />
                    <ThemedText type="small" themeColor="textSecondary">End Date (optional)</ThemedText>
                    <TextInput
                        style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                        placeholderTextColor={theme.textSecondary}
                        placeholder="2027-01-28"
                        value={formEndDate}
                        onChangeText={setFormEndDate}
                    />
                    <ThemedText type="small" themeColor="textSecondary">Notes (optional)</ThemedText>
                    <TextInput
                        style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                        placeholderTextColor={theme.textSecondary}
                        placeholder="..."
                        value={formNotes}
                        onChangeText={setFormNotes}
                    />
                    <View style={styles.modalActions}>
                        <ThemedButton label="Cancel" type="ghost" onPress={() => setModalVisible(false)} />
                        <ThemedButton label="Add" type="primary" onPress={AddOrUpdateCycle} />
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
    actionBlock: {
        gap: 8,
        marginTop: 8,
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
    modalActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 8,
        marginTop: 8,
    },
});