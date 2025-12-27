export interface ParsedQuestion {
    question_text: string;
    options: string[];
    correct_answer: string;
    explanation: string;
}

export const QuestionParser = {
    // Main Entry Point
    parse(text: string): ParsedQuestion[] {
        // Normalize text: remove excessive newlines, unify option markers
        const normalized = text
            .replace(/\r\n/g, '\n')
            .replace(/\t/g, ' ');

        // Strategy: Split by "Number." or "Number)" pattern
        // Regex looks for "1." or "1)" at start of line
        const questionsRaw = normalized.split(/\n(?=\d+[\.\)]\s)/);

        const parsedQuestions: ParsedQuestion[] = [];

        for (const raw of questionsRaw) {
            if (!raw.trim() || raw.length < 10) continue; // Skip empty or too short chunks

            const question = this.parseSingleQuestion(raw);
            if (question) {
                parsedQuestions.push(question);
            }
        }

        return parsedQuestions;
    },

    parseSingleQuestion(raw: string): ParsedQuestion | null {
        try {
            // 1. Extract Question Text
            // It starts from beginning (ignoring number) until the first Option Marker (A) B) ...)
            const optionPattern = /\n\s*[A-Ea-e][\.\)]\s/g;
            const firstOptionMatch = optionPattern.exec(raw);

            if (!firstOptionMatch) return null; // No options found -> not a valid multiple choice

            let questionBody = raw.substring(0, firstOptionMatch.index);
            // Remove leading "1." number
            questionBody = questionBody.replace(/^\d+[\.\)]\s*/, '').trim();

            // 2. Extract Options
            const options: string[] = [];
            // We need to find all options A) ... B) ...
            // Let's iterate A-E
            const markers = ['A', 'B', 'C', 'D', 'E'];

            // Extract the part containing options and potentially answer/explanation
            const optionsPart = raw.substring(firstOptionMatch.index);

            // Split by option markers to get content
            // Need a more robust split that captures the content between markers
            // Example:
            // \nA) Option 1 content \nB) Option 2 content ...

            // A simple way is to use split but keeping delimiters is tricky in JS split.
            // Let's match each option explicitly.

            for (let i = 0; i < markers.length; i++) {
                const marker = markers[i];
                const nextMarker = markers[i + 1];

                // Regex: find Marker) ... until NextMarker) or End
                // Be careful with newlines.

                const startRegex = new RegExp(`\\s*[${marker}${marker.toLowerCase()}][\\.\\)]\\s`, 'i');
                const startMatch = optionsPart.match(startRegex);

                if (startMatch) {
                    const startIndex = startMatch.index! + startMatch[0].length;

                    // Find end index: either next marker or "Cevap:" or End of string
                    let endIndices = [];

                    if (nextMarker) {
                        const nextRegex = new RegExp(`\\s*[${nextMarker}${nextMarker.toLowerCase()}][\\.\\)]\\s`, 'i');
                        const nextMatch = optionsPart.match(nextRegex);
                        if (nextMatch) endIndices.push(nextMatch.index!);
                    }

                    // Check for "Cevap:" or "Çözüm:" keywords
                    const answerMatch = optionsPart.match(/\n(Cevap|Yanıt|Doğru\s*Cevap):/i);
                    if (answerMatch) endIndices.push(answerMatch.index!);

                    const explanationMatch = optionsPart.match(/\n(Çözüm|Açıklama):/i);
                    if (explanationMatch) endIndices.push(explanationMatch.index!);

                    // If no end markers, it goes to the end
                    let endIndex = optionsPart.length;
                    if (endIndices.length > 0) {
                        endIndex = Math.min(...endIndices.filter(idx => idx > startMatch.index!));
                    }

                    let optionContent = optionsPart.substring(startIndex, endIndex).trim();
                    options.push(optionContent);
                } else {
                    // Option missing?
                    // Maybe only 4 options.
                }
            }

            // 3. Extract Correct Answer
            let correct = 'A'; // Default
            const answerMatch = raw.match(/(?:Cevap|Yanıt|Doğru\s*Cevap):\s*([A-E])/i);
            if (answerMatch) {
                correct = answerMatch[1].toUpperCase();
            }

            // 4. Extract Explanation
            let explanation = '';
            const expMatch = raw.match(/(?:Çözüm|Açıklama):\s*([\s\S]*)/i);
            if (expMatch) {
                explanation = expMatch[1].trim();
            }

            // Validation
            if (options.length < 2) return null; // Need at least 2 options

            return {
                question_text: questionBody,
                options: options.slice(0, 5), // Max 5
                correct_answer: correct,
                explanation: explanation
            };

        } catch (e) {
            console.error("Parse error for chunk:", raw.substring(0, 50), e);
            return null;
        }
    }
};
