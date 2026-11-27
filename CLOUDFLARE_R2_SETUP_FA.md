# انتقال امن اسناد IMED/Sepidar به Cloudflare R2

## وضعیت فعلی
- سرویس برنامه از قبل به Cloudflare D1 با نام `imed-manager-db` متصل است و snapshotها و cache پیشنهادهای تطبیق را نگه می‌دارد.
- فضای ذخیره‌سازی فایل خام (R2) در حساب هنوز فعال نیست. فعال‌سازی اولیه باید از داشبورد Cloudflare انجام شود.
- این انتقال فایل‌های منبع را در R2 نگه می‌دارد؛ فایل‌ها داخل GitHub commit نمی‌شوند و bucket عمومی نمی‌شود.

## 1. فعال‌سازی R2
1. وارد Cloudflare Dashboard حساب متصل به پروژه شو.
2. از بخش **R2 Object Storage** آن را فعال کن.
3. یک bucket با نام `imed-source-documents` بساز (موقعیت پیشنهادی: Europe/Western Europe در صورت نمایش گزینه).
4. یک R2 API token با دسترسی **Object Read & Write** فقط برای همین bucket بساز.
5. Access Key ID و Secret Access Key را فقط در محیط اجرای اسکریپت نگه دار؛ آن‌ها را در GitHub، فایل manifest یا چت قرار نده.

## 2. آماده‌سازی فایل‌ها
فایل‌های فهرست‌شده در `scripts/r2-manifest.example.json` را در یک پوشه محلی کنار manifest قرار بده، یا مسیرهای `localPath` را در manifest خودت اصلاح کن. فهرست نمونه از بسته انتقال پروژه برداشته شده؛ اگر نسخه‌ای از فایل در دسترس نیست، آن ردیف را از manifest خودت حذف کن. فایل‌های تکراری گزارش انبار را قبل از حذف/انتخاب با هم مقایسه کن؛ این اسکریپت هیچ فایل محلی یا ابری را حذف نمی‌کند.

## 3. اجرای اسکریپت
Node.js 18 یا جدیدتر لازم است. متغیرها را در ترمینال همان session تنظیم کن:

```bash
export R2_ACCOUNT_ID="YOUR_CLOUDFLARE_ACCOUNT_ID"
export R2_ACCESS_KEY_ID="YOUR_R2_ACCESS_KEY_ID"
export R2_SECRET_ACCESS_KEY="YOUR_R2_SECRET_ACCESS_KEY"
export R2_BUCKET="imed-source-documents"

node scripts/upload-r2-documents.mjs --manifest scripts/r2-manifest.example.json
```

فرمان بالا فقط پیش‌نمایش می‌گیرد و SHA-256 هر فایل را نشان می‌دهد. پس از بررسی مسیرها و فایل‌ها، انتقال را صریحاً اجرا کن:

```bash
node scripts/upload-r2-documents.mjs --manifest scripts/r2-manifest.example.json --execute
```

اگر object هم‌نام با محتوای متفاوت وجود داشته باشد، اسکریپت متوقف می‌شود و چیزی را جایگزین نمی‌کند. فقط بعد از بررسی، برای جایگزینی آگاهانه `--overwrite` را اضافه کن. اسکریپت هیچ‌وقت حذف انجام نمی‌دهد.

## 4. سیاست نگهداری
- فایل‌های خام و نسخه‌های پشتیبان در R2 خصوصی می‌مانند.
- وضعیت برنامه، پیشنهادهای تطبیق و داده‌های ساختاریافته فعلی در D1 باقی می‌مانند.
- قیمت واحد در منطق تطبیق استفاده نمی‌شود.
- برای بازیابی، از نسخه‌بندی/پشتیبان R2 و manifest دارای SHA-256 استفاده کن.
- فایل‌های اصلی را تا زمان تأیید checksum و بازشدن فایل‌های آپلودشده حذف نکن.
