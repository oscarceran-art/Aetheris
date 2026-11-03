export const localDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const dateFromKey = (key) => {
  if (!key) return null;
  const [year, month, day] = String(key).split("-").map(Number);
  return new Date(year, month - 1, day);
};

export const formatDateKey = (key, options = { month: "short", day: "numeric" }) => {
  const date = dateFromKey(key);
  return date ? new Intl.DateTimeFormat(undefined, options).format(date) : "No date";
};
