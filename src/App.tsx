import { HashRouter, Routes, Route } from "react-router-dom";
import { Header } from "@/components/Header";
import { Setup } from "@/pages/Setup";
import { Results } from "@/pages/Results";

function App() {
  return (
    <HashRouter>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="mx-auto w-full flex-1 px-6 py-10 sm:px-8">
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
