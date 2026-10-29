/** Extra fields for the "restrict account" dialog. Plain form controls so they post with the dialog's form. */
export function RestrictFields() {
  const selectClass = "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <label htmlFor="restrict-kind" className="text-sm font-medium">Restriction</label>
        <select id="restrict-kind" name="kind" className={selectClass} defaultValue="messaging_ban">
          <option value="messaging_ban">Block messaging</option>
          <option value="listing_ban">Block new listings</option>
          <option value="suspension">Suspend account</option>
        </select>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="restrict-duration" className="text-sm font-medium">Duration</label>
        <select id="restrict-duration" name="durationDays" className={selectClass} defaultValue="7">
          <option value="1">1 day</option>
          <option value="7">7 days</option>
          <option value="30">30 days</option>
          <option value="0">Until lifted</option>
        </select>
      </div>
    </div>
  );
}
