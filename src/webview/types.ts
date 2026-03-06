export interface Waypoint {
  index: number;
  lon: number;
  lat: number;
  alt: number;
}

export interface InitialData {
  waypoints: Waypoint[];
  filename: string;
  hasWpml: boolean;
}

declare global {
  interface Window {
    __INITIAL_DATA__: InitialData;
  }
}
