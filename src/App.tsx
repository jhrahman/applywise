import { HashRouter, Routes, Route } from "react-router-dom";
import { Header } from "@/components/Header";
import { Setup } from "@/pages/Setup";
import { Results } from "@/pages/Results";

function App() {
  return (
    <HashRouter>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="mx-auto w-full flex-1 px-4 py-6 sm:px-8 sm:py-10">
          <Routes>
            <Route path="/" element={<Setup />} />
            <Route path="/results" element={<Results />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}

export default App;
