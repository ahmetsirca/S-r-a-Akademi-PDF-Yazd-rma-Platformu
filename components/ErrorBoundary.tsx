import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center font-sans">
                    <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-6 text-3xl">
                        <i className="fas fa-bug"></i>
                    </div>
                    <h1 className="text-2xl font-bold text-slate-800 mb-2">Bir Hata Oluştu</h1>
                    <p className="text-slate-600 mb-6 max-w-md">
                        Uygulama beklenmedik bir hatayla karşılaştı. İnternet bağlantınızdan veya geçici bir sorundan kaynaklanıyor olabilir.
                    </p>
                    <div className="bg-white p-4 rounded border border-slate-200 text-left text-xs text-red-500 font-mono mb-6 w-full max-w-md overflow-auto max-h-32">
                        {this.state.error?.toString()}
                    </div>
                    <div className="flex gap-2 flex-wrap justify-center">
                        <button
                            onClick={() => window.location.reload()}
                            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-blue-700 shadow transition"
                        >
                            Sayfayı Yenile
                        </button>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(this.state.error?.toString() || "Bilinmeyen Hata");
                                alert("Hata metni kopyalandı!");
                            }}
                            className="bg-slate-200 text-slate-700 px-6 py-3 rounded-lg font-bold hover:bg-slate-300 transition"
                        >
                            <i className="fas fa-copy mr-2"></i> Hatayı Kopyala
                        </button>
                    </div>

                    <button
                        onClick={() => {
                            if (confirm("Uygulama verileri temizlenip sıfırlanacak. Emin misiniz?")) {
                                localStorage.clear();
                                window.location.reload();
                            }
                        }}
                        className="mt-8 text-red-500 text-sm hover:text-red-700 underline"
                    >
                        Sorun devam ederse: Uygulamayı Sıfırla
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
