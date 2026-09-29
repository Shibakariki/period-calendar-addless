import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { addCycleInDb, deleteCycleInDb, getAllCyclesInDb } from '../db/cycles';
import type { Cycle } from '../db/types';
import { ThemedButton } from './themed-button';
import { ThemedText } from './themed-text';
export default function TestCycles() {
  const theme = useTheme();
  const [cycles, setCycles] = useState<Cycle[]>([]);

  useEffect(() => {
    (async () => {
        let list = await getAllCyclesInDb();
        if (list.length === 0) {
            await addCycleInDb({ startDate: '2026-09-01',endDate: null, notes: null });
            await addCycleInDb({ startDate: '2026-09-27',endDate: '2026-10-02', notes: null });
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

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [selectedCycle, setSelectedCycle] = useState<Cycle | null>(null);

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
                    <ThemedText>Selected Cycle: {selectedCycle.startDate} - {selectedCycle.endDate ?? 'Ongoing'}</ThemedText>
                    <ThemedButton
                        label="Delete Cycle"
                        type="secondary"
                        onPress={() => {
                            if (selectedCycle) {
                                deleteCycle(selectedCycle);
                            }
                        }}/>
                    </>
            ) : (
                <ThemedText>No cycle selected</ThemedText>
            )}
        </ThemedView>
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
});