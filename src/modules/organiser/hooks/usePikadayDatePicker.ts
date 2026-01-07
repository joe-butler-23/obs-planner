import * as React from "react";
import Pikaday from "pikaday";

interface UsePikadayDatePickerOptions {
	isOpen: boolean;
	inputRef: React.RefObject<HTMLInputElement>;
	containerRef: React.RefObject<HTMLElement>;
	selectedDate?: Date;
	format?: string;
	onSelect: (date: Date) => void;
	onClose: () => void;
}

interface UsePikadayDatePickerResult {
	gotoToday: () => void;
	clear: () => void;
}

export const usePikadayDatePicker = (
	options: UsePikadayDatePickerOptions
): UsePikadayDatePickerResult => {
	const {
		isOpen,
		inputRef,
		containerRef,
		selectedDate,
		format = "YYYY-MM-DD",
		onSelect,
		onClose,
	} = options;

	const pickerRef = React.useRef<Pikaday | null>(null);

	React.useEffect(() => {
		if (!isOpen) {
			if (pickerRef.current) {
				pickerRef.current.destroy();
				pickerRef.current = null;
			}
			return;
		}

		const input = inputRef.current;
		const container = containerRef.current;
		if (!input || !container) return;

		const picker = new Pikaday({
			field: input,
			container,
			bound: false,
			format,
			onSelect: (date: Date) => onSelect(date),
			onClose: () => onClose(),
		});

		if (selectedDate) {
			picker.setDate(selectedDate, true);
		}

		picker.show();
		pickerRef.current = picker;

		// Remove tooltips from day abbreviations
		container.querySelectorAll(".pika-table abbr[title]").forEach((abbr) => {
			abbr.removeAttribute("title");
		});

		return () => {
			picker.destroy();
			pickerRef.current = null;
		};
	}, [format, inputRef, containerRef, isOpen, onClose, onSelect, selectedDate]);

	const gotoToday = React.useCallback(() => {
		pickerRef.current?.gotoToday();
		pickerRef.current?.setDate(new Date(), true);
	}, []);

	const clear = React.useCallback(() => {
		pickerRef.current?.clear();
	}, []);

	return { gotoToday, clear };
};
