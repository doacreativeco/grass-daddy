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
function todayIsoLocal() {
  var d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

async function login(page, email, password) {
  await page.goto(url("login.html"), { waitUntil: "networkidle0" });
  await page.evaluate(() => {
    ["gdAdminAuthed", "gdAdminAuthedAt", "gdAuthUser", "gdAccountPasswords",
      "gdAccountEmails", "gdAdminPasscode", "gdAdminPasscodeHash",
      "grassDaddyLeads", "grassDaddyBookings", "gdLogLeadId", "gdScheduleLeadId"]
      .forEach((k) => window.localStorage.removeItem(k));
  });
  await page.reload({ waitUntil: "networkidle0" });
  await page.type("#loginEmail", email || "doacreativeco@gmail.com");
  await page.type("#loginPassword", password || "Denyel08!");
  await page.keyboard.press("Enter");
  await wait(500);
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE_PATH, headless: "new", defaultViewport: { width: 1440, height: 1100 } });
  const page = await browser.newPage();
  page.on("dialog", async (dialog) => { await dialog.accept(); });
  page.on("pageerror", (err) => { console.error("PAGEERROR:", err.message); });

  await login(page);
  assert(page.url().includes("dashboard.html"), "admin email/password lands on the Today dashboard");
  const signedIn = await page.$eval("#gdSignedIn", (el) => el.textContent.trim());
  assert(signedIn === "Denye · Admin", "sidebar shows the signed-in admin: " + signedIn);

  const greeting = await page.$eval("#crmTitle", (el) => el.textContent.trim());
  assert(greeting.length > 0, "Today page shows a dated heading: " + greeting);

  // Seed CRM data: one hot overdue lead, one new lead, one booking for today.
  const iso = todayIsoLocal();
  await page.evaluate((today) => {
    window.localStorage.setItem("grassDaddyLeads", JSON.stringify([
      {
        id: "lead-hot-1",
        name: "Hot Followup",
        phone: "8605550100",
        town: "Avon, CT",
        address: "9 Maple St",
        category: "Lawn Maintenance",
        status: "Contacted",
        priority: "hot",
        followUpDate: "2020-01-01",
        estimatedValue: 1200,
        createdAt: new Date().toISOString(),
        message: "Needs a call back",
        activities: []
      },
      {
        id: "lead-new-1",
        name: "Fresh Quote",
        phone: "8605550101",
        town: "Hartford, CT",
        address: "15 Pearl St",
        category: "Irrigation & Drainage",
        status: "New",
        createdAt: new Date().toISOString(),
        message: "French drain quote"
      }
    ]));
    window.localStorage.setItem("grassDaddyBookings", JSON.stringify([
      {
        id: "booking-today-1",
        clientName: "Route Client",
        phone: "8605550199",
        town: "Glastonbury, CT",
        service: "Lawn Maintenance",
        startDate: today,
        time: "09:00",
        recurrence: "once",
        payment: "unpaid",
        notes: "Front and back",
        completedDates: [],
        createdAt: new Date().toISOString()
      }
    ]));
  }, iso);
  await page.reload({ waitUntil: "networkidle0" });
  await wait(200);

  const todayText = await page.$eval("#todayJobs", (el) => el.textContent);
  assert(/Route Client/.test(todayText), "Today's route lists the booked client");
  assert(/9:00 AM/.test(todayText), "Today's route shows the appointment time");

  const followText = await page.$eval("#followUps", (el) => el.textContent);
  assert(/Hot Followup/.test(followText), "overdue follow-up appears on Today");
  assert(/Hot/.test(followText), "hot badge appears on the follow-up card");

  await page.click('[data-toggle-done="booking-today-1"]');
  await wait(200);
  const doneClass = await page.$eval(".crm-job", (el) => el.classList.contains("is-done"));
  assert(doneClass, "marking a job Done adds the done state");
  const completed = await page.evaluate(() => JSON.parse(window.localStorage.getItem("grassDaddyBookings"))[0].completedDates);
  assert(Array.isArray(completed) && completed.length === 1, "completedDates is saved on the booking");

  await page.click('[data-toggle-done="booking-today-1"]');
  await wait(200);
  const undone = await page.evaluate(() => JSON.parse(window.localStorage.getItem("grassDaddyBookings"))[0].completedDates);
  assert(Array.isArray(undone) && undone.length === 0, "Undo clears the completed date");

  await page.screenshot({ path: path.join(OUT_DIR, "check-crm-today.png"), fullPage: true });
  console.log("captured: check-crm-today.png");

  await page.goto(url("customers.html"), { waitUntil: "networkidle0" });
  await wait(200);
  const custList = await page.$eval("#custList", (el) => el.textContent);
  assert(/Hot Followup/.test(custList), "customers list includes seeded leads");
  assert(/Route Client/.test(custList), "customers list includes booking-only clients");
  await page.click('[data-cust-key="lead:lead-hot-1"]');
  await wait(150);
  const detail = await page.$eval("#custDetail", (el) => el.textContent);
  assert(/Hot Followup/.test(detail), "customer 360 opens the selected record");
  const contactBtn = await page.$("[data-contact-menu]");
  assert(!!contactBtn, "customer record has a Contact button instead of separate Call/Text");
  const topCall = await page.$('.cust-detail__actions > a.crm-action[href^="tel:"]');
  assert(!topCall, "Call is not a standalone action on the customer record");
  const billingLabels = await page.$$eval(".cust-action-group__label", (els) => els.map((el) => el.textContent.trim()));
  assert(billingLabels.join(" ") === "Job Billing Record", "customer actions sit in three equal groups: " + billingLabels.join(", "));
  const deleteClientBtn = await page.$("[data-delete-client]");
  assert(!!deleteClientBtn, "customer record has a Delete client button");
  const pastBtnText = await page.$eval("#pastClientsBtn", (el) => el.textContent.trim());
  assert(/Past clients/.test(pastBtnText), "Past clients button is at the bottom of the customers list");

  await page.click("[data-delete-client]");
  await wait(150);
  const deleteOpen = await page.$eval("#deleteClientModal", (el) => el.classList.contains("is-open"));
  assert(deleteOpen, "delete asks you to verify before removing the client");
  await page.click("#deleteClientConfirm");
  await wait(200);
  const afterDelete = await page.$eval("#custList", (el) => el.textContent);
  assert(!/Hot Followup/.test(afterDelete), "deleted client leaves the active customers list");
  assert(/Route Client/.test(afterDelete), "other clients stay on the list after a delete");

  await page.click("#pastClientsBtn");
  await wait(150);
  const pastList = await page.$eval("#custList", (el) => el.textContent);
  assert(/Hot Followup/.test(pastList), "deleted client appears under Past clients");
  const restoreBtn = await page.$("[data-restore-client]");
  assert(!!restoreBtn, "past client record has a Restore client button");
  await page.click("[data-restore-client]");
  await wait(150);
  const restoredList = await page.$eval("#custList", (el) => el.textContent);
  assert(/Hot Followup/.test(restoredList), "restored client returns to the active customers list");

  // Pipeline + activity log on leads
  await page.goto(url("leads.html"), { waitUntil: "networkidle0" });
  await wait(200);

  const newText = await page.$eval("#newLeadsList", (el) => el.textContent);
  assert(/Fresh Quote/.test(newText), "new uncontacted lead appears in the Leads New leads section");
  await page.waitForSelector("#newLeadsMap iframe", { timeout: 8000 });
  const mapFrame = await page.$eval("#newLeadsMap iframe", (el) => el.getAttribute("src")).catch(() => null);
  assert(!!mapFrame && /maps\.google\.com|openstreetmap\.org/.test(mapFrame), "new leads section shows a property map");

  const pipelineOptions = await page.$$eval("#pipelineSelect option", (els) => els.map((e) => e.value));
  assert(pipelineOptions.indexOf("Hot") !== -1, "pipeline tabs include Hot");
  assert(pipelineOptions.indexOf("Follow-up") !== -1, "pipeline tabs include Follow-up");

  await page.select("#pipelineSelect", "Hot");
  await wait(150);
  let visibleNames = await page.$$eval(".lead-card__name", (els) => els.map((e) => e.textContent.trim()));
  assert(visibleNames.length === 1 && visibleNames[0] === "Hot Followup", "Hot pipeline filter shows only the hot lead");

  await page.select("#pipelineSelect", "All");
  await wait(150);

  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll(".lead-card")).find((c) => {
      const name = c.querySelector(".lead-card__name");
      return name && name.textContent.trim() === "Hot Followup";
    });
    if (card) card.querySelector(".leads__log-btn").click();
  });
  await wait(200);
  const activityOpen = await page.$eval("#activityModal", (el) => el.classList.contains("is-open"));
  assert(activityOpen, "Log button opens the activity modal");
  await page.select("#activityType", "call");
  await page.type('#activityForm textarea[name="text"]', "Called, left voicemail.");
  await page.click('#activityForm button[type="submit"]');
  await wait(250);

  const afterLog = await page.evaluate(() => {
    const leads = JSON.parse(window.localStorage.getItem("grassDaddyLeads") || "[]");
    const hot = leads.find((l) => l.id === "lead-hot-1");
    return { hotActs: hot && hot.activities ? hot.activities.length : 0 };
  });
  assert(afterLog.hotActs >= 1, "activity is stored on the lead");

  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll(".lead-card")).find((c) => {
      const name = c.querySelector(".lead-card__name");
      return name && name.textContent.trim() === "Fresh Quote";
    });
    if (card) card.querySelector(".leads__log-btn").click();
  });
  await wait(200);
  await page.select("#activityType", "call");
  await page.type('#activityForm textarea[name="text"]', "Intro call.");
  await page.click('#activityForm button[type="submit"]');
  await wait(250);
  const freshStatus = await page.evaluate(() => {
    const leads = JSON.parse(window.localStorage.getItem("grassDaddyLeads") || "[]");
    const fresh = leads.find((l) => l.id === "lead-new-1");
    return fresh ? fresh.status : null;
  });
  assert(freshStatus === "Contacted", "logging a call on a New lead moves it to Contacted");

  // Calendar payment + done
  await page.goto(url("calendar.html"), { waitUntil: "networkidle0" });
  await wait(250);
  await page.evaluate(() => {
    const chip = document.querySelector(".cal__chip");
    if (chip) chip.click();
  });
  await wait(200);
  await page.select("#bookingPaymentSelect", "paid");
  await page.click('#bookingForm button[type="submit"]');
  await wait(250);
  const paid = await page.evaluate(() => JSON.parse(window.localStorage.getItem("grassDaddyBookings"))[0].payment);
  assert(paid === "paid", "booking payment status saves as paid");

  await page.evaluate(() => {
    const cell = document.querySelector(".cal__cell.is-today");
    if (cell) cell.click();
  });
  await wait(200);
  await page.click(".cal__day-done-btn");
  await wait(250);
  const calCompleted = await page.evaluate(() => JSON.parse(window.localStorage.getItem("grassDaddyBookings"))[0].completedDates);
  assert(Array.isArray(calCompleted) && calCompleted.length === 1, "Done from the day modal stores the completed date");

  await page.goto(url("customers.html"), { waitUntil: "networkidle0" });
  await wait(200);
  await page.evaluate(() => {
    window.localStorage.setItem("grassDaddyBills", JSON.stringify([{
      id: "bill-hot-1", number: "1001", clientName: "Hot Followup", phone: "8605550100",
      leadId: "lead-hot-1", date: "2026-08-01", status: "unpaid",
      items: [{ qty: 1, unitPrice: 80 }]
    }]));
    window.localStorage.setItem("grassDaddyEstimates", JSON.stringify([{
      id: "est-hot-1", number: "E-1", clientName: "Hot Followup", phone: "8605550100",
      leadId: "lead-hot-1", date: "2026-08-01", status: "draft",
      items: [{ qty: 1, unitPrice: 80 }]
    }]));
  });
  await page.reload({ waitUntil: "networkidle0" });
  await wait(200);
  await page.click('[data-cust-key="lead:lead-hot-1"]');
  await wait(150);
  await page.click("[data-delete-client]");
  await wait(150);
  await page.click("#deleteClientConfirm");
  await wait(200);
  await page.click("#pastClientsBtn");
  await wait(150);
  const adminPurgeBtn = await page.$("[data-purge-client]");
  assert(!!adminPurgeBtn, "admin sees Delete forever on a past client");
  await page.click("[data-purge-client]");
  await wait(150);
  const purgeOpen = await page.$eval("#purgeClientModal", (el) => el.classList.contains("is-open"));
  assert(purgeOpen, "admin must confirm before permanently deleting a past client");
  await page.click("#purgeClientConfirm");
  await wait(250);
  const afterPurge = await page.evaluate(() => ({
    list: document.getElementById("custList").textContent,
    leads: JSON.parse(window.localStorage.getItem("grassDaddyLeads") || "[]"),
    bills: JSON.parse(window.localStorage.getItem("grassDaddyBills") || "[]"),
    estimates: JSON.parse(window.localStorage.getItem("grassDaddyEstimates") || "[]"),
    past: JSON.parse(window.localStorage.getItem("grassDaddyPastClients") || "[]")
  }));
  assert(!/Hot Followup/.test(afterPurge.list), "purged client leaves Past clients");
  assert(!afterPurge.leads.some((l) => l.id === "lead-hot-1"), "purge removes the matching lead");
  assert(!afterPurge.bills.some((b) => b.leadId === "lead-hot-1"), "purge removes matching invoices");
  assert(!afterPurge.estimates.some((e) => e.leadId === "lead-hot-1"), "purge removes matching estimates");
  assert(!afterPurge.past.some((p) => p.key === "lead:lead-hot-1"), "purge removes the past-client record");

  await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll("[data-cust-key]")).find((el) => /Route Client/.test(el.textContent));
    if (row) row.click();
  });
  await wait(150);
  const routeDetail = await page.$eval("#custDetail", (el) => el.textContent);
  assert(/Route Client/.test(routeDetail), "Route Client is still on the customers list after the purge");
  await page.click("[data-delete-client]");
  await wait(150);
  await page.click("#deleteClientConfirm");
  await wait(200);

  await page.click("#logoutBtn");
  await wait(400);
  assert(page.url().includes("login.html"), "admin can log out before the owner signs in");
  await page.type("#loginEmail", "izzy@grassdaddy.com");
  await page.type("#loginPassword", "izzy123");
  await page.keyboard.press("Enter");
  await wait(500);
  assert(page.url().includes("dashboard.html"), "owner email/password logs Izzy in");
  const ownerSignedIn = await page.$eval("#gdSignedIn", (el) => el.textContent.trim());
  assert(ownerSignedIn === "Izzy · Owner", "sidebar shows the signed-in owner: " + ownerSignedIn);

  await page.goto(url("customers.html"), { waitUntil: "networkidle0" });
  await wait(200);
  await page.click("#pastClientsBtn");
  await wait(150);
  const ownerPast = await page.$eval("#custList", (el) => el.textContent);
  assert(/Route Client/.test(ownerPast), "owner can still open Past clients");
  const ownerRestore = await page.$("[data-restore-client]");
  assert(!!ownerRestore, "owner can restore a past client");
  const ownerPurge = await page.$("[data-purge-client]");
  assert(!ownerPurge, "owner does not see Delete forever");
  const ownerCanPurge = await page.evaluate(() => window.GDAuth && window.GDAuth.canPurgePastClients());
  assert(!ownerCanPurge, "owner account is blocked from permanently deleting past clients");

  await page.evaluate(() => {
    ["grassDaddyLeads", "grassDaddyBookings", "grassDaddyBills", "grassDaddyEstimates",
      "grassDaddyPastClients", "gdAdminAuthed", "gdAdminAuthedAt", "gdAuthUser", "gdLogLeadId"]
      .forEach((k) => window.localStorage.removeItem(k));
  });
  await browser.close();
  console.log("\nALL CRM TESTS PASSED");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
