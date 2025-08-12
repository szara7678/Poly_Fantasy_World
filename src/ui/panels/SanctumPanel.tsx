import React from 'react';
import { consecrate, getSanctums } from '../../systems/SanctumSystem';

export function SanctumPanel(): React.JSX.Element {
  const [, setCount] = React.useState(0);
  const onConsecrate = (): void => {
    consecrate([0, 0, 0], 36);
    setCount((c) => c + 1);
  };

  return (
    <div>
      <h3>성역</h3>
      <button onClick={onConsecrate}>성역화(미리보기)</button>
      <div>성역 수: {getSanctums().length}</div>
    </div>
  );
}


