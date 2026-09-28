# One-shot generator that added the Apple Watch targets to App.xcodeproj (2026-09-26).
# Kept for reference / re-creation; it refuses to run twice.
#   cd ios/App && ruby scripts/add-watch-targets.rb
require 'xcodeproj'

TEAM = 'PQZ8V7ZAXU'
IOS_BUNDLE = 'com.lazylazy.huddle'
WATCH_BUNDLE = "#{IOS_BUNDLE}.watchkitapp"
WATCH_OS = '10.0'

project = Xcodeproj::Project.open(File.expand_path('../App.xcodeproj', __dir__))
abort 'HuddleWatch target already exists' if project.targets.any? { |t| t.name == 'HuddleWatch' }
app = project.targets.find { |t| t.name == 'App' } or abort 'App target missing'
main = project.main_group

def group(main, name)
  main.children.find { |g| g.display_name == name } || main.new_group(name, name)
end

shared = group(main, 'WatchShared')
models = shared.new_file('WatchModels.swift')
local_store = shared.new_file('WatchLocalStore.swift')
strings = shared.new_file('Localizable.xcstrings')
strings.last_known_file_type = 'text.json.xcstrings'

watch_group = group(main, 'HuddleWatch')
watch_sources = %w[HuddleWatchApp.swift WatchModel.swift].map { |f| watch_group.new_file(f) }
watch_assets = watch_group.new_file('Assets.xcassets')
watch_group.new_file('HuddleWatch.entitlements')

widget_group = group(main, 'HuddleWatchWidgets')
widget_source = widget_group.new_file('HuddleWatchWidgets.swift')
widget_group.new_file('Info.plist')
widget_group.new_file('HuddleWatchWidgets.entitlements')

app_group = main.children.find { |g| g.display_name == 'App' }
bridge = app_group.new_file('WatchBridge.swift')

common = lambda do |t, bundle, entitlements|
  t.build_configurations.each do |c|
    s = c.build_settings
    s['PRODUCT_BUNDLE_IDENTIFIER'] = bundle
    s['PRODUCT_NAME'] = '$(TARGET_NAME)'
    s['DEVELOPMENT_TEAM'] = TEAM
    s['CODE_SIGN_STYLE'] = 'Automatic'
    s['CODE_SIGN_ENTITLEMENTS'] = entitlements
    s['SDKROOT'] = 'watchos'
    s['WATCHOS_DEPLOYMENT_TARGET'] = WATCH_OS
    s['TARGETED_DEVICE_FAMILY'] = '4'
    s['SWIFT_VERSION'] = '5.0'
    s['MARKETING_VERSION'] = '1.0'          # must match the iOS app
    s['CURRENT_PROJECT_VERSION'] = '1'
    s['GENERATE_INFOPLIST_FILE'] = 'YES'
    s['INFOPLIST_KEY_CFBundleDisplayName'] = 'Huddle'
    s['SWIFT_EMIT_LOC_STRINGS'] = 'YES'
    s['LOCALIZATION_PREFERS_STRING_CATALOGS'] = 'YES'
    s['SKIP_INSTALL'] = 'YES'
  end
end

# watchOS app (single-target SwiftUI app, companion = the iOS app)
watch = project.new_target(:application, 'HuddleWatch', :watchos, WATCH_OS)
common.call(watch, WATCH_BUNDLE, 'HuddleWatch/HuddleWatch.entitlements')
watch.build_configurations.each do |c|
  s = c.build_settings
  s['INFOPLIST_KEY_WKCompanionAppBundleIdentifier'] = IOS_BUNDLE
  s['INFOPLIST_KEY_WKRunsIndependentlyOfCompanionApp'] = 'NO'
  s['ASSETCATALOG_COMPILER_APPICON_NAME'] = 'AppIcon'
  s['ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME'] = 'AccentColor'
end
watch.add_file_references(watch_sources + [models, local_store])
watch.add_resources([watch_assets, strings])

# watchOS WidgetKit extension (complications + Smart Stack)
widgets = project.new_target(:app_extension, 'HuddleWatchWidgets', :watchos, WATCH_OS)
common.call(widgets, "#{WATCH_BUNDLE}.widgets", 'HuddleWatchWidgets/HuddleWatchWidgets.entitlements')
widgets.build_configurations.each do |c|
  s = c.build_settings
  s['INFOPLIST_FILE'] = 'HuddleWatchWidgets/Info.plist'
  s['APPLICATION_EXTENSION_API_ONLY'] = 'YES'
end
widgets.add_file_references([widget_source, models, local_store])
widgets.add_resources([strings])

# watch app embeds the complication extension
watch.add_dependency(widgets)
embed_ext = watch.new_copy_files_build_phase('Embed Foundation Extensions')
embed_ext.symbol_dst_subfolder_spec = :plug_ins
embed_ext.add_file_reference(widgets.product_reference, true).settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }

# iOS app: WatchConnectivity bridge + embeds the watch app
app.add_file_references([bridge, models])
app.add_dependency(watch)
embed_watch = app.new_copy_files_build_phase('Embed Watch Content')
embed_watch.dst_subfolder_spec = '16'
embed_watch.dst_path = '$(CONTENTS_FOLDER_PATH)/Watch'
embed_watch.add_file_reference(watch.product_reference, true).settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }

project.root_object.known_regions |= ['zh-Hant']
project.save
puts 'added HuddleWatch + HuddleWatchWidgets'
