import React, { useState, useEffect } from 'react';
import { QuizService } from '../services/db';
import { QuizQuestion } from '../types';

const QuizMode: React.FC = () => {
    const [questions, setQuestions] = useState<QuizQuestion[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedOption, setSelectedOption] = useState<string | null>(null);
    const [showSolution, setShowSolution] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadQuestions();
    }, []);

    const loadQuestions = async () => {
        setLoading(true);
        const data = await QuizService.getQuestions();
        setQuestions(data);
        setLoading(false);
    };

    const handleOptionSelect = (optionLabel: string) => {
        if (showSolution) return; // Prevent changing after showing solution
        setSelectedOption(optionLabel);
    };

    const handleNext = () => {
        if (currentIndex < questions.length - 1) {
            setCurrentIndex(prev => prev + 1);
            resetState();
        }
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
            resetState();
        }
    };

    const resetState = () => {
        setSelectedOption(null);
        setShowSolution(false);
    };

    if (loading) return <div className="p-10 text-center text-slate-500">Sorular yükleniyor...</div>;

    if (questions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[500px] text-slate-500">
                <i className="fas fa-clipboard-list text-6xl mb-4 text-slate-300"></i>
                <p className="text-xl">Henüz hiç soru eklenmemiş.</p>
            </div>
        );
    }

    const currentQuestion = questions[currentIndex];
    // Helper to extract option label (A, B, C...) from option string if it includes it, or usually index
    // Assuming options array is ["A) ...", "B) ..."] or just text.
    // Let's assume the data structure we will push has "A) Answer" formats.

    const isCorrect = selectedOption === currentQuestion.correct_answer;

    return (
        <div className="max-w-3xl mx-auto p-4 md:p-8">
            {/* Progress */}
            <div className="flex justify-between items-center mb-6 text-sm text-slate-500 font-bold">
                <span>Soru {currentIndex + 1} / {questions.length}</span>
                <span>Sırça Akademi Deneme Sınavı</span>
            </div>

            {/* Question Card */}
            <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
                {/* Question Text */}
                <div className="p-6 md:p-8 bg-slate-50 border-b border-slate-100">
                    <h2 className="text-xl md:text-2xl font-bold text-slate-800 leading-relaxed font-serif">
                        {currentQuestion.question_text}
                    </h2>
                </div>

                {/* Options */}
                <div className="p-6 md:p-8 space-y-3">
                    {currentQuestion.options.map((option, idx) => {
                        const labels = ['A', 'B', 'C', 'D', 'E'];
                        const label = labels[idx] || '?';
                        const isSelected = selectedOption === label;
                        const isCorrectAnswer = label === currentQuestion.correct_answer;

                        let optionClass = "border-slate-200 hover:bg-slate-50 hover:border-blue-300 text-slate-700";

                        if (showSolution) {
                            if (isCorrectAnswer) {
                                optionClass = "bg-green-100 border-green-500 text-green-800 font-bold";
                            } else if (isSelected && !isCorrectAnswer) {
                                optionClass = "bg-red-100 border-red-500 text-red-800";
                            } else {
                                optionClass = "opacity-50 border-slate-100";
                            }
                        } else if (isSelected) {
                            optionClass = "bg-blue-600 border-blue-600 text-white shadow-md transform scale-[1.01]";
                        }

                        return (
                            <button
                                key={idx}
                                onClick={() => handleOptionSelect(label)}
                                className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 flex items-center gap-4 group ${optionClass}`}
                                disabled={showSolution}
                            >
                                <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border ${isSelected || (showSolution && isCorrectAnswer) ? 'border-transparent bg-white/20' : 'border-slate-300 bg-slate-100 text-slate-500'}`}>
                                    {label}
                                </span>
                                <span className="flex-1 text-lg">{option}</span>
                                {showSolution && isCorrectAnswer && <i className="fas fa-check-circle text-2xl text-green-600"></i>}
                                {showSolution && isSelected && !isCorrectAnswer && <i className="fas fa-times-circle text-2xl text-red-600"></i>}
                            </button>
                        );
                    })}
                </div>

                {/* Footer / Controls */}
                <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                    <button
                        onClick={handlePrev}
                        disabled={currentIndex === 0}
                        className="px-4 py-2 text-slate-500 hover:text-slate-800 disabled:opacity-30 font-bold flex items-center gap-2"
                    >
                        <i className="fas fa-arrow-left"></i> Önceki
                    </button>

                    {!showSolution ? (
                        <button
                            onClick={() => {
                                if (!selectedOption) {
                                    alert("Lütfen bir şık işaretleyiniz.");
                                    return;
                                }
                                setShowSolution(true);
                            }}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg transition transform active:scale-95"
                        >
                            Cevabı Kontrol Et
                        </button>
                    ) : (
                        <button
                            onClick={handleNext}
                            disabled={currentIndex === questions.length - 1}
                            className="bg-slate-800 hover:bg-slate-900 text-white px-8 py-3 rounded-xl font-bold shadow-lg transition transform active:scale-95 flex items-center gap-2"
                        >
                            Sonraki Soru <i className="fas fa-arrow-right"></i>
                        </button>
                    )}
                </div>

                {/* Solution Expansion */}
                {showSolution && (
                    <div className="bg-green-50 p-6 border-t border-green-100 animate-slide-up">
                        <h3 className="font-bold text-green-800 mb-2 flex items-center gap-2">
                            <i className="fas fa-lightbulb text-yellow-500"></i> Çözüm Açıklaması
                        </h3>
                        <p className="text-green-900 leading-relaxed">
                            {currentQuestion.explanation || "Bu soru için açıklama girilmemiş."}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default QuizMode;
