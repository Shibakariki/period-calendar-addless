import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { useEffect, useState } from 'react';
import { Modal, StyleSheet, TextInput, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { addCycleInDb, deleteCycleInDb, getAllCyclesInDb, updateCycleInDb } from '../db/cycles';
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
        if (list.length === 0) {
            await addCycleInDb({ startDate: '2026-10-01',endDate: "2026-10-03", notes: null });
            await addCycleInDb({ startDate: '2026-10-19',endDate: null, notes: null });
            list = await getAllCyclesInDb();
        }
      setCycles(list);
    })().catch(console.error);
  }, []);

  const deleteCycle = async (cycle: Cycle) => {
    await deleteCycleInDb(cycle.id)  
    setCycles(cycles.filter(c => c !== cycle));
    setSelectedCycle(null);
    setSelectedDate(null);
  };

  const AddOrUpdateCycle = async () => {
    console.log('AddOrUpdateCycle called with:', { formId, formStartDate, formEndDate, formNotes });
    if (!formStartDate) return;
    if (formId) {
        await updateCycleInDb({ id: formId, startDate: formStartDate, endDate: formEndDate || null, notes: formNotes || null });
        setModalVisible(false);
    }
    else {
        await addCycleInDb({ startDate: formStartDate, endDate: formEndDate || null, notes: formNotes || null });
    }
    setModalVisible(false);
    const list = await getAllCyclesInDb();
    setCycles(list);
    if (formId) {
      setSelectedCycle(list.find(c => c.id === formId) ?? null);
    }
    return;
  };

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedCycle, setSelectedCycle] = useState<Cycle | null>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [formId, setFormId] = useState<number | null>(null);
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const openModal = () => {
    setFormId(selectedCycle?.id ?? null);
    setFormStartDate(selectedCycle?.startDate ?? selectedDate ?? '');
    setFormEndDate(selectedCycle?.endDate ?? '');
    setFormNotes(selectedCycle?.notes ?? '');
    setModalVisible(true);
  };

  return (
    <ThemedView style={styles.view}>
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
            markedDates={(() => {
                const acc = cycles.reduce((acc, cycle) => {
                    const start = new Date(cycle.startDate);
                    const end = new Date(cycle.endDate ?? cycle.startDate);
                    const current = new Date(start);
                    while (current <= end) {
                        const dateStr = current.toISOString().split('T')[0];
                        const isStart = dateStr === cycle.startDate;
                        const isEnd = dateStr === (cycle.endDate ?? cycle.startDate);
                        acc[dateStr] = {
                            startingDay: isStart,
                            endingDay: isEnd,
                            color: theme.dateRegistered,
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
            })()}
            markingType="period"
            onDayPress={(day) => {
                const selected = cycles.find(cycle => {
                    const date = day.dateString;
                    const start = cycle.startDate;
                    const end = cycle.endDate ?? cycle.startDate;
                    return date >= start && date <= end;
                });
                setSelectedCycle(selected ?? null);
                setSelectedDate(day.dateString);
            }}
        />
        <ThemedView 
            style={styles.selectedCycleView}
        >
            {selectedCycle ? (
                <>
                    <ThemedText>
                        Selected Cycle: {selectedCycle.startDate} - {selectedCycle.endDate ?? 'Ongoing'}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                        Notes: {selectedCycle.notes ?? 'Empty'}
                    </ThemedText>
                    <ThemedButton 
                        label="Modify Cycle" 
                        type="primary" 
                        onPress={openModal} 
                    />
                    
                    <ThemedButton
                        label="Delete Cycle"
                        type="secondary"
                        onPress={() => {
                            if (selectedCycle) {
                                deleteCycle(selectedCycle);
                            }
                        }}
                    />
                </>
            ) : (
                <>
                    <ThemedText>No cycle selected</ThemedText>
                    <ThemedButton 
                        label="Add Cycle" 
                        type="primary" 
                        onPress={openModal} 
                    />
                </>
            )}

        </ThemedView>

        <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
            <View style={styles.overlay}>
                <ThemedView style={styles.modal}>
                    <ThemedText type="subtitle">New Cycle</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">Start date (YYYY-MM-DD)</ThemedText>
                    <TextInput
                        style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                        placeholderTextColor={theme.textSecondary}
                        placeholder="2027-01-01"
                        value={formStartDate}
                        onChangeText={setFormStartDate}
                    />
                    <ThemedText type="small" themeColor="textSecondary">End date (optional)</ThemedText>
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
    calendar: {
        borderWidth: 0.2,
        borderColor: '#e0e0e0',
        borderRadius: 10,
        overflow: 'hidden',
    },
    selectedCycleView: {
        marginTop: 20,
        padding: 10,
        borderWidth: 0.2,
        borderColor: '#e0e0e0',
        borderRadius: 10,
        overflow: 'hidden',
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