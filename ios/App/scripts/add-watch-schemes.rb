# Shared schemes. Needed because Xcode's auto-generated "HuddleWatch" scheme also pulls in
# the iOS App target, which cannot build for watchOS. Once any shared scheme exists Xcode
# stops auto-creating the others, so App and HuddleWidgets are written here too.
#   cd ios/App && ruby scripts/add-watch-schemes.rb
require 'xcodeproj'

path = File.expand_path('../App.xcodeproj', __dir__)
project = Xcodeproj::Project.open(path)
{ 'App' => true, 'HuddleWidgets' => false, 'HuddleWatch' => true, 'HuddleWatchWidgets' => false }.each do |name, runnable|
  target = project.targets.find { |t| t.name == name } or abort "missing target #{name}"
  scheme = Xcodeproj::XCScheme.new
  scheme.add_build_target(target)
  scheme.set_launch_target(target) if runnable
  scheme.save_as(path, name, true)
end
puts 'schemes written'
