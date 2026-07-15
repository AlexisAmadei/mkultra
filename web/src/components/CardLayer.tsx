import { useBoard } from "../store/boardStore";
import { Card } from "./Card";

export function CardLayer() {
  const cards = useBoard((s) => s.cards);
  return (
    <div className="card-layer">
      {Object.values(cards).map((c) => (
        <Card key={c.id} card={c} />
      ))}
    </div>
  );
}
