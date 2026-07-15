import { Board } from "./components/Board";
import { useSync } from "./hooks/useSync";

export default function App() {
  useSync();
  return <Board />;
}
