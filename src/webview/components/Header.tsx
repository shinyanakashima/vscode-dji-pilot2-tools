import React from 'react';

interface Props {
  filename: string;
  count: number;
  hasWpml: boolean;
}

export default function Header({ filename, count, hasWpml }: Props) {
  return (
    <div id="header">
      <h1>{filename}</h1>
      <span className="badge badge-kmz">KMZ</span>
      {hasWpml && <span className="badge badge-wpml">WPML</span>}
      <span className="meta">{count} waypoints</span>
    </div>
  );
}
