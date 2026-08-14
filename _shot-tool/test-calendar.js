const puppeteer = require("puppeteer-core");
const path = require("path");

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const OUT_DIR = path.resolve(__dirname, "..", "assets");

function url(p) { return "file:///" + path.resolve(__dirname, "..", p).replace(/\\/g, "/"); }
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
function assert(cond, msg) {
  if (!cond) throw new Error("ASSERTION FAILED: " + msg);
  console.log("PASS:", msg);
}
function isoOffset(days) {
  var d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function login(page) {
  await page.goto(url("login.html"), { waitUntil: "networkidle0" });
  await page.evaluate(() => {
    ["gdAdminAuthed", "gdAdminAuthedAt", "gdAuthUser", "gdAccountPasswords",
      "gdAdminPasscode", "gdAdminPasscodeHash",
      "grassDaddyLeads", "grassDaddyBookings", "gdScheduleLeadId"]
      .forEach((k) => window.localStorage.removeItem(k));
  });
  await page.reload({ waitUntil: "networkidle0" });
  await page.type("#loginEmail", "doacreativeco@gmail.com");
  await page.type("#loginPassword", "Denyel08!");
  await page.keyboard.press("Enter");
  await wait(500);
}

async function fillBookingForm(page, { clientName, phone, town, service, startDate, time, recurrence, endDate, notes }) {
  if (clientName != null) {
    await page.evaluate((v) => (document.querySelector('#bookingForm [name="clientName"]').value = ""), clientName);
    await page.type('#bookingForm [name="clientName"]', clientName);
  }
  if (phone != null) await page.type('#bookingForm [name="phone"]', phone);
  if (town != null) await page.type('#bookingForm [name="town"]', town);
  if (service != null) await page.select('#bookingForm [name="service"]', service);
  if (startDate != null) await page.evaluate((v) => (document.querySelector('#bookingForm [name="startDate"]').value = v), startDate);
  if (time != null) await page.evaluate((v) => (document.querySelector('#bookingForm [name="time"]').value = v), time);
  if (recurrence != null) await page.select("#bookingRecurrenceSelect", recurrence);
  if (endDate != null) await page.evaluate((v) => (document.querySelector('#bookingForm [name="endDate"]').value = v), endDate);
  if (notes != null) await page.type('#bookingForm [name="notes"]', notes);
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE_PATH, headless: "new", defaultViewport: { width: 1500, height: 1100 } });
  const page = await browser.newPage();
  page.on("dialog", async (dialog) => { await dialog.accept(); });

  await login(page);
  assert(page.url().includes("dashboard.html"), "login redirects to dashboard.html");

  // ---------- navigate via the new Calendar nav link ----------
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0" }),
    page.click('a[href="calendar.html"]')
  ]);
  assert(page.url().includes("calendar.html"), "clicking the Calendar nav link opens calendar.html");

  const calNavActive = await page.$eval(".leads-header__nav-link.is-active", (el) => el.textContent.trim());
  assert(calNavActive === "Calendar", "Calendar nav link shows as active on calendar.html");

  // ---------- empty state stats ----------
  let statNums = await page.$$eval(".leads__stat-num", (els) => els.map((e) => e.textContent.trim()));
  assert(statNums.length === 4, "calendar stats row renders 4 stat cards");
  assert(statNums.every((n) => n === "0"), "all stats start at 0 with no bookings");

  // ---------- add a one-time booking today ----------
  await page.click("#addBookingBtn");
  await wait(150);
  await fillBookingForm(page, { clientName: "Test OneTime", phone: "8605550001", service: "Lawn Maintenance", startDate: isoOffset(0), time: "09:00", recurrence: "once", notes: "Mow + edge" });
  await page.click('#bookingForm button[type="submit"]');
  await wait(200);

  const todayCellChip = await page.$eval('.cal__cell.is-today .cal__chip-name', (el) => el.textContent.trim()).catch(() => null);
  assert(todayCellChip === "Test OneTime", "one-time booking chip renders on today's calendar cell");

  // ---------- add a weekly recurring booking starting today ----------
  await page.click("#addBookingBtn");
  await wait(150);
  await fillBookingForm(page, { clientName: "Test Weekly", service: "Irrigation & Drainage", startDate: isoOffset(0), time: "14:00", recurrence: "weekly" });
  await page.click('#bookingForm button[type="submit"]');
  await wait(200);

  // ---------- add a biweekly booking that started 7 days ago (so it lands on day+7, not day 0) ----------
  await page.click("#addBookingBtn");
  await wait(150);
  await fillBookingForm(page, { clientName: "Test Biweekly", service: "Hardscaping & Stonework", startDate: isoOffset(-7), time: "11:30", recurrence: "biweekly" });
  await page.click('#bookingForm button[type="submit"]');
  await wait(200);

  // ---------- agenda: day 0 should have OneTime + Weekly but NOT Biweekly ----------
  const day0Names = await page.evaluate(() => {
    const days = Array.from(document.querySelectorAll(".cal__agenda-day"));
    const first = days[0];
    if (!first) return [];
    return Array.from(first.querySelectorAll(".cal__agenda-name")).map((el) => el.textContent.trim());
  });
  assert(day0Names.indexOf("Test OneTime") !== -1, "agenda day 0 includes the one-time booking");
  assert(day0Names.indexOf("Test Weekly") !== -1, "agenda day 0 includes the weekly booking (starts today)");
  assert(day0Names.indexOf("Test Biweekly") === -1, "agenda day 0 does NOT include the biweekly booking (offset by 7 days)");

  // ---------- agenda: day 7 should have Weekly + Biweekly but NOT OneTime ----------
  const allAgendaNames = await page.$$eval(".cal__agenda-name", (els) => els.map((e) => e.textContent.trim()));
  const weeklyCount = allAgendaNames.filter((n) => n === "Test Weekly").length;
  const biweeklyCount = allAgendaNames.filter((n) => n === "Test Biweekly").length;
  assert(weeklyCount === 2, "weekly booking appears twice in the 14-day agenda (day 0 and day 7)");
  assert(biweeklyCount === 1, "biweekly booking (offset -7) appears exactly once in the 14-day agenda (day 7)");

  // ---------- stats updated ----------
  statNums = await page.$$eval(".leads__stat-num", (els) => els.map((e) => e.textContent.trim()));
  assert(statNums[3] === "3", "total on the books stat shows 3");

  // ---------- agenda shows the appointment time for each booking ----------
  const agendaTimes = await page.$$eval(".cal__agenda-time", (els) => els.map((e) => e.textContent.trim()));
  assert(agendaTimes.indexOf("9:00 AM") !== -1, "agenda shows the on-the-hour time correctly as 9:00 AM (not 9 AM)");
  assert(agendaTimes.indexOf("2:00 PM") !== -1, "agenda shows the weekly booking's time as 2:00 PM");
  assert(agendaTimes.indexOf("11:30 AM") !== -1, "agenda shows the biweekly booking's time as 11:30 AM");

  // ---------- day cell chip on the calendar grid also shows the time ----------
  const todayChipTime = await page.$eval(".cal__cell.is-today .cal__chip-time", (el) => el.textContent.trim());
  assert(todayChipTime === "9:00 AM", "the month-grid chip for today also shows the appointment time");

  // ---------- time is now a required field ----------
  await page.click("#addBookingBtn");
  await wait(150);
  await page.type("#bookingClientName", "Test No Time");
  await page.evaluate(() => (document.querySelector('#bookingForm [name="startDate"]').value = new Date().toISOString().slice(0, 10)));
  const countBeforeNoTimeAttempt = await page.evaluate(() => JSON.parse(window.localStorage.getItem("grassDaddyBookings") || "[]").length);
  await page.click('#bookingForm button[type="submit"]');
  await wait(200);
  const modalStillOpenAfterNoTime = await page.$eval("#bookingModal", (el) => el.classList.contains("is-open"));
  assert(modalStillOpenAfterNoTime, "submitting a booking without a time keeps the modal open (blocked by validation)");
  const countAfterNoTimeAttempt = await page.evaluate(() => JSON.parse(window.localStorage.getItem("grassDaddyBookings") || "[]").length);
  assert(countAfterNoTimeAttempt === countBeforeNoTimeAttempt, "no booking is saved when the required time field is left blank");

  const timeFieldIsRequired = await page.$eval('#bookingForm [name="time"]', (el) => el.required);
  assert(timeFieldIsRequired, "the time input has the HTML required attribute");

  await page.evaluate(() => (document.querySelector('#bookingForm [name="time"]').value = "10:15"));
  await page.click('#bookingForm button[type="submit"]');
  await wait(200);
  const countAfterAddingTime = await page.evaluate(() => JSON.parse(window.localStorage.getItem("grassDaddyBookings") || "[]").length);
  assert(countAfterAddingTime === countBeforeNoTimeAttempt + 1, "the same booking saves successfully once a time is filled in");

  // ---------- monthly recurrence + end-of-month clamping ----------
  await page.click("#addBookingBtn");
  await wait(150);
  await fillBookingForm(page, { clientName: "Test Monthly Clamp", service: "Spring / Fall Cleanup", startDate: "2026-01-31", time: "08:00", recurrence: "monthly" });
  await page.click('#bookingForm button[type="submit"]');
  await wait(200);

  // navigate back to January 2026
  for (let i = 0; i < 24; i++) {
    const label = await page.$eval("#calMonthLabel", (el) => el.textContent.trim());
    if (label === "January 2026") break;
    await page.click("#calPrevBtn");
    await wait(60);
  }
  let monthLabel = await page.$eval("#calMonthLabel", (el) => el.textContent.trim());
  assert(monthLabel === "January 2026", "navigated calendar back to January 2026");

  let jan31Chip = await page.evaluate(() => {
    const cell = document.querySelector('.cal__cell[data-day-iso="2026-01-31"]');
    const chip = cell ? cell.querySelector(".cal__chip-name") : null;
    return chip ? chip.textContent.trim() : null;
  });
  assert(jan31Chip === "Test Monthly Clamp", "monthly booking chip appears on Jan 31, 2026");

  await page.click("#calNextBtn");
  await wait(150);
  monthLabel = await page.$eval("#calMonthLabel", (el) => el.textContent.trim());
  assert(monthLabel === "February 2026", "navigated forward to February 2026");

  let feb28Chip = await page.evaluate(() => {
    const cell = document.querySelector('.cal__cell[data-day-iso="2026-02-28"]');
    const chip = cell ? cell.querySelector(".cal__chip-name") : null;
    return chip ? chip.textContent.trim() : null;
  });
  assert(feb28Chip === "Test Monthly Clamp", "monthly booking clamps to Feb 28 (shorter month) instead of skipping");

  await page.click("#calNextBtn");
  await wait(150);
  monthLabel = await page.$eval("#calMonthLabel", (el) => el.textContent.trim());
  assert(monthLabel === "March 2026", "navigated forward to March 2026");

  let mar31Chip = await page.evaluate(() => {
    const cell = document.querySelector('.cal__cell[data-day-iso="2026-03-31"]');
    const chip = cell ? cell.querySelector(".cal__chip-name") : null;
    return chip ? chip.textContent.trim() : null;
  });
  assert(mar31Chip === "Test Monthly Clamp", "monthly booking returns to the 31st once March has 31 days again");

  await page.screenshot({ path: path.join(OUT_DIR, "check-calendar-march.png"), fullPage: true });
  console.log("captured: check-calendar-march.png");

  // ---------- go back to Today, edit a booking via chip click ----------
  await page.click("#calTodayBtn");
  await wait(200);

  await page.evaluate(() => {
    const chip = Array.from(document.querySelectorAll(".cal__chip")).find((c) => c.textContent.indexOf("Test OneTime") !== -1);
    chip.click();
  });
  await wait(200);
  let editTitle = await page.$eval("#bookingModalTitle", (el) => el.textContent.trim());
  assert(editTitle === "Edit booking", "clicking a chip opens the edit modal");
  let prefilledName = await page.$eval('#bookingForm [name="clientName"]', (el) => el.value);
  assert(prefilledName === "Test OneTime", "edit modal pre-fills the booking's client name");

  await page.evaluate(() => (document.querySelector('#bookingForm [name="notes"]').value = ""));
  await page.type('#bookingForm [name="notes"]', "Updated notes for QA");
  await page.click('#bookingForm button[type="submit"]');
  await wait(200);

  const updatedNotes = await page.evaluate(() => {
    const bookings = JSON.parse(window.localStorage.getItem("grassDaddyBookings") || "[]");
    const b = bookings.find((x) => x.clientName === "Test OneTime");
    return b ? b.notes : null;
  });
  assert(updatedNotes === "Updated notes for QA", "editing a booking persists changes to localStorage");

  // ---------- delete a booking ----------
  const countBefore = await page.evaluate(() => JSON.parse(window.localStorage.getItem("grassDaddyBookings") || "[]").length);
  await page.evaluate(() => {
    const chip = Array.from(document.querySelectorAll(".cal__chip")).find((c) => c.textContent.indexOf("Test OneTime") !== -1);
    chip.click();
  });
  await wait(200);
  await page.click("#deleteBookingBtn");
  await wait(200);
  const countAfter = await page.evaluate(() => JSON.parse(window.localStorage.getItem("grassDaddyBookings") || "[]").length);
  assert(countAfter === countBefore - 1, "deleting a booking removes it from storage (count " + countBefore + " -> " + countAfter + ")");

  // ---------- day modal: click a day cell to see all bookings for that day ----------
  await page.evaluate(() => {
    document.querySelector('.cal__cell.is-today').click();
  });
  await wait(200);
  const dayModalOpen = await page.$eval("#dayModal", (el) => el.classList.contains("is-open"));
  assert(dayModalOpen, "clicking a day cell opens the day detail modal");
  const dayModalHasWeekly = await page.evaluate(() => document.getElementById("dayModalList").textContent.indexOf("Test Weekly") !== -1);
  assert(dayModalHasWeekly, "day modal lists the weekly booking for today");
  await page.evaluate(() => document.querySelectorAll("[data-day-modal-close]")[0].click());
  await wait(150);

  // ---------- client name autocomplete ----------
  await page.click("#addBookingBtn");
  await wait(150);
  await page.type("#bookingClientName", "Test We");
  await wait(150);

  const suggestionsVisible = await page.$eval("#clientSuggestions", (el) => !el.hidden);
  assert(suggestionsVisible, "typing a partial name shows the suggestions dropdown");

  const suggestionNames = await page.$$eval(".cal__suggestion-name", (els) => els.map((e) => e.textContent.trim()));
  assert(suggestionNames.indexOf("Test Weekly") !== -1, "suggestions include a matching existing client (Test Weekly)");
  assert(suggestionNames.indexOf("Test Biweekly") === -1, "suggestions exclude non-matching names (Test Biweekly)");

  const suggestionTag = await page.$eval(".cal__suggestion-tag", (el) => el.textContent.trim());
  assert(suggestionTag === "Client", "existing (non-lead) bookings are tagged as 'Client' in suggestions");

  await page.click(".cal__suggestion");
  await wait(100);
  const filledAfterSuggestionClick = await page.evaluate(() => ({
    name: document.querySelector('#bookingForm [name="clientName"]').value,
    service: document.querySelector('#bookingForm [name="service"]').value
  }));
  assert(filledAfterSuggestionClick.name === "Test Weekly", "clicking a suggestion fills the client name");
  assert(filledAfterSuggestionClick.service === "Irrigation & Drainage", "clicking a suggestion also fills the associated service");

  const suggestionsHiddenAfterPick = await page.$eval("#clientSuggestions", (el) => el.hidden);
  assert(suggestionsHiddenAfterPick, "suggestions dropdown closes after picking a suggestion");

  // keyboard navigation: type again, arrow down, press Enter
  await page.evaluate(() => (document.querySelector('#bookingForm [name="clientName"]').value = ""));
  await page.type("#bookingClientName", "Test");
  await wait(150);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await wait(120);
  const nameAfterKeyboardSelect = await page.$eval('#bookingForm [name="clientName"]', (el) => el.value);
  assert(nameAfterKeyboardSelect.indexOf("Test") === 0, "arrow-down + Enter selects the first suggestion: " + nameAfterKeyboardSelect);

  await page.keyboard.press("Escape");
  await wait(400);
  await page.click("[data-booking-modal-close]");
  await wait(400);

  // ---------- import from lead + "Schedule" quick action from leads.html ----------
  await page.goto(url("leads.html"), { waitUntil: "networkidle0" });
  await page.click("#seedBtn");
  await wait(200);

  const firstLead = await page.evaluate(() => {
    const leads = JSON.parse(window.localStorage.getItem("grassDaddyLeads") || "[]");
    const firstRow = document.querySelector("#leadsCards .lead-card[data-id]");
    const id = firstRow ? firstRow.getAttribute("data-id") : null;
    const lead = leads.find((l) => l.id === id);
    return lead ? { id: lead.id, name: lead.name } : null;
  });
  const firstLeadName = firstLead ? firstLead.name : null;
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0" }),
    page.evaluate(() => document.querySelector("#leadsCards .leads__schedule-btn").click())
  ]);
  assert(page.url().includes("calendar.html"), "clicking Schedule on a lead row navigates to calendar.html");
  await wait(300);

  const bookingModalOpenFromHandoff = await page.$eval("#bookingModal", (el) => el.classList.contains("is-open"));
  assert(bookingModalOpenFromHandoff, "booking modal auto-opens after arriving from a lead's Schedule button");
  const handoffName = await page.$eval('#bookingForm [name="clientName"]', (el) => el.value);
  assert(handoffName === firstLeadName, "booking modal is pre-filled with the lead's name: " + handoffName);

  const deleteBtnVisible = await page.$eval("#deleteBookingBtn", (el) => getComputedStyle(el).display !== "none");
  assert(!deleteBtnVisible, "Delete booking button stays hidden for a brand-new (unsaved) booking");

  const handoffKeyCleared = await page.evaluate(() => window.localStorage.getItem("gdScheduleLeadId"));
  assert(handoffKeyCleared === null, "schedule handoff key is cleared from localStorage after use");

  await page.screenshot({ path: path.join(OUT_DIR, "check-calendar-schedule-handoff.png") });
  console.log("captured: check-calendar-schedule-handoff.png");

  // discard the unsaved handoff booking before the next check (Escape is the
  // reliable way to close a centered modal in a headless click simulation —
  // clicking the full-viewport backdrop lands on the centered panel instead,
  // since Puppeteer clicks the target element's bounding-box center).
  await page.keyboard.press("Escape");
  await wait(200);

  // ---------- editing a booking preserves its linked leadId ----------
  await page.click("#addBookingBtn");
  await wait(150);
  await page.select("#bookingFromLead", firstLead.id);
  await wait(150);
  await page.evaluate(() => {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    document.querySelector('#bookingForm [name="startDate"]').value = d.toISOString().slice(0, 10);
    document.querySelector('#bookingForm [name="time"]').value = "09:00";
  });
  await page.click('#bookingForm button[type="submit"]');
  await wait(300);

  const newBookingId = await page.evaluate((leadId) => {
    const bookings = JSON.parse(window.localStorage.getItem("grassDaddyBookings") || "[]");
    const match = bookings.find((b) => b.leadId === leadId);
    return match ? match.id : null;
  }, firstLead.id);
  assert(newBookingId, "booking created via the lead dropdown is saved with a leadId");

  // Re-open that same booking for editing and confirm the lead dropdown is pre-selected.
  await page.evaluate((id) => {
    const chips = Array.from(document.querySelectorAll(".cal__chip"));
    const chip = chips.find((c) => c.getAttribute("data-booking-id") === id);
    if (chip) chip.click();
  }, newBookingId);
  await wait(200);
  const dropdownValueOnEditOpen = await page.$eval("#bookingFromLead", (el) => el.value);
  assert(dropdownValueOnEditOpen === firstLead.id, "editing a booking pre-selects its originally linked lead in the dropdown");

  await page.type('#bookingForm [name="notes"]', "Edited during regression test");
  await page.click('#bookingForm button[type="submit"]');
  await wait(300);

  const leadIdAfterEdit = await page.evaluate((id) => {
    const bookings = JSON.parse(window.localStorage.getItem("grassDaddyBookings") || "[]");
    const match = bookings.find((b) => b.id === id);
    return match ? match.leadId : undefined;
  }, newBookingId);
  assert(leadIdAfterEdit === firstLead.id, "saving an edited booking keeps its leadId instead of wiping it, got " + leadIdAfterEdit);

  const convertedStatus = await page.evaluate((id) => {
    const leads = JSON.parse(window.localStorage.getItem("grassDaddyLeads") || "[]");
    const lead = leads.find((l) => l.id === id);
    return lead ? lead.status : null;
  }, firstLead.id);
  assert(convertedStatus === "Won", "booking a lead marks them Won so they move to Customers");

  await page.goto(url("leads.html"), { waitUntil: "networkidle0" });
  await wait(200);
  const stillOnLeads = await page.evaluate((name) => {
    return Array.from(document.querySelectorAll(".lead-card__name")).some((el) => el.textContent.trim() === name);
  }, firstLeadName);
  assert(!stillOnLeads, "booked customer no longer appears on the Leads page");

  await page.goto(url("customers.html"), { waitUntil: "networkidle0" });
  await wait(200);
  const onCustomers = await page.evaluate((name) => {
    return document.body.innerText.indexOf(name) !== -1;
  }, firstLeadName);
  assert(onCustomers, "booked customer appears on the Customers page");

  // ---------- clean up ----------
  await page.evaluate(() => {
    window.localStorage.removeItem("grassDaddyLeads");
    window.localStorage.removeItem("grassDaddyBookings");
    window.localStorage.removeItem("gdAdminAuthed");
    window.localStorage.removeItem("gdScheduleLeadId");
  });

  await browser.close();
  console.log("\nALL CALENDAR TESTS PASSED");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
