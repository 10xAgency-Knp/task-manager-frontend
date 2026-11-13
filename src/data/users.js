/* Team members (fictional). reportsTo builds the team tree: a person's team is everyone below them.
   Every demo account signs in with DEMO_PASSWORD. */
export const DEMO_PASSWORD = "Demo@12345";

export const USERS = [
  { id: 1,  name: "Aarav Mehta",      email: "aarav@the10xagency.in",    phone: "9810011001", role: "Admin",    superAdmin: true, designation: "Founder & Director",           department: "Management",      city: "New Delhi", reportsTo: null, joined: -1460 },
  { id: 2,  name: "Priya Sharma",     email: "priya@the10xagency.in",    phone: "9810011002", role: "Admin",    designation: "Operations Head",              department: "Operations",      city: "New Delhi", reportsTo: 1,    joined: -1100 },
  { id: 3,  name: "Vikram Rao",       email: "vikram@the10xagency.in",   phone: "9810011003", role: "Manager",  designation: "Digital Marketing Manager",    department: "Marketing",       city: "Gurugram",  reportsTo: 2,    joined: -980 },
  { id: 4,  name: "Neha Kapoor",      email: "neha@the10xagency.in",     phone: "9810011004", role: "Manager",  designation: "Web Development Lead",         department: "Development",     city: "Noida",     reportsTo: 2,    joined: -910 },
  { id: 5,  name: "Rohan Verma",      email: "rohan@the10xagency.in",    phone: "9810011005", role: "Manager",  designation: "Sales Manager",                department: "Sales",           city: "New Delhi", reportsTo: 1,    joined: -870 },
  { id: 6,  name: "Ananya Iyer",      email: "ananya@the10xagency.in",   phone: "9810011006", role: "Employee", designation: "SEO Team Lead",                department: "Marketing",       city: "Gurugram",  reportsTo: 3,    joined: -700 },
  { id: 7,  name: "Karan Malhotra",   email: "karan@the10xagency.in",    phone: "9810011007", role: "Employee", designation: "Performance Marketer",         department: "Marketing",       city: "New Delhi", reportsTo: 3,    joined: -640 },
  { id: 8,  name: "Sneha Pillai",     email: "sneha@the10xagency.in",    phone: "9810011008", role: "Employee", designation: "Social Media Executive",       department: "Marketing",       city: "Faridabad", reportsTo: 3,    joined: -420 },
  { id: 9,  name: "Arjun Nair",       email: "arjun@the10xagency.in",    phone: "9810011009", role: "Employee", designation: "SEO Executive",                department: "Marketing",       city: "Noida",     reportsTo: 6,    joined: -300 },
  { id: 10, name: "Ishaan Joshi",     email: "ishaan@the10xagency.in",   phone: "9810011010", role: "Employee", designation: "Full Stack Developer",         department: "Development",     city: "Noida",     reportsTo: 4,    joined: -610 },
  { id: 11, name: "Meera Reddy",      email: "meera@the10xagency.in",    phone: "9810011011", role: "Employee", designation: "UI/UX Designer",               department: "Development",     city: "New Delhi", reportsTo: 4,    joined: -520 },
  { id: 12, name: "Aditya Singh",     email: "aditya@the10xagency.in",   phone: "9810011012", role: "Employee", designation: "WordPress Developer",          department: "Development",     city: "Ghaziabad", reportsTo: 4,    joined: -380 },
  { id: 13, name: "Kavya Desai",      email: "kavya@the10xagency.in",    phone: "9810011013", role: "Employee", designation: "QA Engineer",                  department: "Development",     city: "Noida",     reportsTo: 4,    joined: -260, status: "On Leave" },
  { id: 14, name: "Siddharth Bansal", email: "siddharth@the10xagency.in", phone: "9810011014", role: "Employee", designation: "Business Development Executive", department: "Sales",       city: "New Delhi", reportsTo: 5,    joined: -450 },
  { id: 15, name: "Riya Choudhary",   email: "riya@the10xagency.in",     phone: "9810011015", role: "Employee", designation: "Account Manager",              department: "Sales",           city: "Gurugram",  reportsTo: 5,    joined: -400 },
  { id: 16, name: "Manish Kumar",     email: "manish@the10xagency.in",   phone: "9810011016", role: "Employee", designation: "Sales Executive",              department: "Sales",           city: "New Delhi", reportsTo: 5,    joined: -330, status: "Inactive" },
  { id: 17, name: "Pooja Agarwal",    email: "pooja@the10xagency.in",    phone: "9810011017", role: "Employee", designation: "Video Editor",                 department: "Creative",        city: "New Delhi", reportsTo: 3,    joined: -280 },
  { id: 18, name: "Deepak Yadav",     email: "deepak@the10xagency.in",   phone: "9810011018", role: "Employee", designation: "Graphic Designer",             department: "Creative",        city: "Faridabad", reportsTo: 3,    joined: -250 },
  { id: 19, name: "Tanvi Kulkarni",   email: "tanvi@the10xagency.in",    phone: "9810011019", role: "Employee", designation: "HR Executive",                 department: "Human Resource",  city: "New Delhi", reportsTo: 2,    joined: -560 },
  { id: 20, name: "Nikhil Saxena",    email: "nikhil@the10xagency.in",   phone: "9810011020", role: "Manager",  designation: "E-commerce Manager",           department: "E-commerce",      city: "Gurugram",  reportsTo: 2,    joined: -690 },
  { id: 21, name: "Shreya Ghosh",     email: "shreya@the10xagency.in",   phone: "9810011021", role: "Employee", designation: "Marketplace Executive",        department: "E-commerce",      city: "Noida",     reportsTo: 20,   joined: -210 },
  { id: 22, name: "Farhan Qureshi",   email: "farhan@the10xagency.in",   phone: "9810011022", role: "Employee", designation: "Catalog Executive",            department: "E-commerce",      city: "New Delhi", reportsTo: 20,   joined: -12, mustChange: true },
  /* removed earlier: in the Recycle Bin, kept as an archived row like the real CRM */
  { id: 23, name: "Gaurav Mishra",    email: "gaurav@the10xagency.in",   phone: "9810011023", role: "Employee", designation: "Content Writer",               department: "Marketing",       city: "Noida",     reportsTo: null, joined: -500, status: "Inactive", deletedDaysAgo: 6 }
];

/* Extra permissions the Super Admin has ticked (true) or unticked (false) on top of the role defaults */
export const PERMISSION_OVERRIDES = {
  6: { "workload.team": true, "activity.team": true, "view_reports": true },   // SEO Team Lead sees her team's work
  15: { "deals.view": true, "deals.edit": true },                             // Account Manager works in the pipeline
  14: { "deals.view": true, "deals.edit": true },
  8: { "tags.delete": true }
};
