declare module 'ffprobe-static' {
  const ffprobeStatic: {
    path: string | null;
    version?: string;
    url?: string;
  };

  export default ffprobeStatic;
}
